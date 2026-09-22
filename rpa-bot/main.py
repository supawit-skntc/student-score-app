"""
main.py — จุดเริ่มต้นสำหรับรันบอท (ตัวเดียวที่ต้องสั่งรันจริง)

ก่อนใช้ครั้งแรก ต้องรัน setup_credentials.py (หรือดับเบิลคลิก
setup_credentials.bat) เพื่อตั้งค่าบัญชีก่อน 1 ครั้ง

วิธีใช้งาน:
  python main.py --dry-run       ทดสอบทุกรายการในคิว กรอกฟอร์มแต่ไม่กดบันทึกจริง (ควรรันแบบนี้ก่อนเสมอ)
  python main.py                 รันจริง ประมวลผลทุกรายการที่สถานะ 'pending' แล้วบันทึกเข้า RMS จริง

ง่ายกว่านั้น: ดับเบิลคลิก run_bot.bat (จริง) หรือ run_bot_dryrun.bat (ทดสอบ)
แทนการพิมพ์คำสั่งเองก็ได้ — ไม่ต้องเปิด PowerShell เลย
"""

import argparse
import logging
import os
import subprocess
import sys
import time

from sheets_queue import get_pending_records, update_status, log_event, report_bot_failure
from rms_bot import run_batch

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("main")

STATUS_MAP = {
    "submitted": "synced",
    "synced": "synced",
    "needs_review": "needs_review",
    "error": "error",
}

# ==========================================
# 🔒 กันรันซ้อนกัน — เดิมไม่มีการล็อกเลย ถ้าคิวค้างเยอะจนรันไม่ทันภายในรอบถัดไปที่
# Windows Task Scheduler จะสั่งรัน (เช่นตั้งไว้ทุก 15 นาที) จะมีบอทตัวที่สองเปิดขึ้น
# มาซ้อนกับตัวแรกที่ยังไม่เสร็จ ทั้งสอง instance อาจดึงคิวชุดเดียวกันมาพร้อมกัน มี
# ช่วงเวลาสั้นๆ ที่ REF tag ยังไม่ทันปรากฏในหน้า RMS ก่อนทั้งคู่จะกดบันทึกพร้อมกัน
# — เสี่ยงบันทึกข้อมูลซ้ำจริงใน RMS ล็อกนี้กันไว้ไม่ให้เกิดกรณีนั้น
#
# เช็คด้วย PID จริง (ผ่าน tasklist ที่มีอยู่แล้วในทุกเครื่อง Windows ไม่ต้อง
# ติดตั้งไลบรารีเพิ่ม) แทนการเดาจากเวลาที่ไฟล์ค้างอยู่ — กันกรณีบอทตัวก่อน crash
# กลางคันไม่ทันลบไฟล์ lock ทิ้ง (ถ้าใช้แค่ "ไฟล์เก่ากว่า N นาทีถือว่าค้าง" อาจไป
# ตัดสินผิดว่าบอทที่กำลังรันจริงอยู่ "ค้าง" ทั้งที่ยังไม่ตายจริง)
# ==========================================
LOCK_FILE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".bot.lock")


def _pid_is_running(pid: int) -> bool:
    try:
        output = subprocess.check_output(
            ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
            text=True, stderr=subprocess.DEVNULL,
        )
        return str(pid) in output
    except Exception:
        # เช็คไม่ได้ (เช่น รันบนเครื่องที่ไม่ใช่ Windows) — ปลอดภัยไว้ก่อน ถือว่า
        # "อาจยังรันอยู่" กันปล่อยให้รันซ้อนโดยไม่ตั้งใจ
        return True


def acquire_lock() -> bool:
    """คืนค่า True ถ้าได้ล็อก (ไม่มีบอทตัวอื่นรันอยู่จริง ปลอดภัยที่จะรันต่อ) —
    ถ้ามีไฟล์ล็อกค้างจากโปรเซสที่ยัง "มีชีวิต" อยู่จริง คืน False ให้ผู้เรียกข้าม
    รอบนี้ไปเฉยๆ (ไม่ใช่ error)"""
    if os.path.exists(LOCK_FILE_PATH):
        try:
            with open(LOCK_FILE_PATH, "r") as f:
                old_pid = int(f.read().strip())
        except (ValueError, OSError):
            old_pid = None

        if old_pid and _pid_is_running(old_pid):
            return False
        # ไฟล์ล็อกค้างจากโปรเซสที่ตายไปแล้ว (crash กลางคันไม่ทันลบไฟล์) —
        # ปลอดภัยที่จะยึดล็อกต่อ

    with open(LOCK_FILE_PATH, "w") as f:
        f.write(str(os.getpid()))
    return True


def release_lock() -> None:
    try:
        os.remove(LOCK_FILE_PATH)
    except OSError:
        pass


def run(dry_run: bool) -> None:
    pending = get_pending_records()
    log.info("พบ %d รายการรอดำเนินการ", len(pending))

    if not pending:
        return

    counts = {"synced": 0, "needs_review": 0, "error": 0, "dry_run": 0}

    def handle_record_done(record, outcome, duration_seconds):
        log.info("--- ประมวลผลเสร็จ %s (นักเรียน %s) ---", record["id"], record["studentId"])
        result_status = outcome["status"]

        # 🛡️ ครอบการรายงานสถานะกลับด้วย try/except — เดิมถ้า report สถานะกลับไม่
        # สำเร็จ (แม้บันทึกเข้า RMS จริงไปแล้ว) จะทำให้ทั้ง run() พังทันที เหลือ
        # รายการที่ยังไม่ถึงคิวไม่ถูกแตะเลยแม้แต่รายการเดียว ตอนนี้ข้ามไปรายการ
        # ถัดไปแทน แล้วสรุปให้เห็นตอนจบว่าพังไปกี่รายการ — ปลอดภัยเสมอเพราะกลไก
        # กันซ้ำด้วย REF tag ใน rms_bot.py จะตรวจพบเองว่ารายการไหนบันทึกเข้า RMS
        # ไปแล้วจริงตอนรันรอบถัดไป ไม่มีทางบันทึกซ้ำ
        try:
            if dry_run:
                counts["dry_run"] += 1
                log.info("[DRY RUN] ผลลัพธ์: %s (%.1f วินาที) — ไม่บันทึก log เพราะเป็นการทดสอบ", outcome, duration_seconds)
            else:
                sheet_status = STATUS_MAP.get(result_status, "error")
                counts[sheet_status] = counts.get(sheet_status, 0) + 1
                update_status(record["id"], sheet_status, outcome.get("message", ""))
                log_event(
                    record_id=record["id"], student_id=record["studentId"], offense=record["offense"],
                    status=sheet_status, message=outcome.get("message", ""), duration_seconds=duration_seconds,
                )
                log.info("บันทึกสถานะ '%s' กลับไปที่เว็บแอปแล้ว (ใช้เวลา %.1f วินาที)", sheet_status, duration_seconds)
        except Exception as e:
            counts["error"] = counts.get("error", 0) + 1
            log.exception(
                "รายการ %s ล้มเหลวระหว่างรายงานสถานะกลับ — ข้ามไปทำรายการถัดไป "
                "(ถ้าบันทึกเข้า RMS ไปแล้วจริง รอบหน้าจะตรวจพบจาก REF tag แล้วมาร์กสำเร็จให้เอง "
                "ไม่มีทางบันทึกซ้ำ): %s",
                record["id"], e,
            )

    try:
        log.info("เข้าสู่ระบบ RMS ครั้งเดียว แล้วประมวลผลทั้งคิว...")
        run_batch(pending, dry_run=dry_run, on_record_done=handle_record_done)
    except Exception as e:
        log.exception("การรันบอททั้ง batch ล้มเหลว (เช่น login RMS ไม่สำเร็จตั้งแต่ต้น)")
        if not dry_run:
            report_bot_failure(f"บอทหยุดทำงานกลางคัน (เช่น login RMS ไม่สำเร็จ): {e}")
        raise

    log.info("=== สรุปผล ===")
    for status, count in counts.items():
        if count:
            log.info("  %s: %d รายการ", status, count)

    # 🔔 ทุกรายการในคิวพังหมดในรอบเดียว (ไม่ใช่แค่บางรายการ) เป็นสัญญาณว่าอาจมี
    # ปัญหาระบบ (RMS เปลี่ยนหน้าเว็บ, บัญชีบอทถูกล็อก ฯลฯ) ไม่ใช่แค่ปัญหาของ
    # รายการเดียว — แจ้งผู้ดูแลระบบให้มาดูก่อนที่คิวจะค้างสะสมนานเกินไป
    if not dry_run and pending and counts.get("error", 0) == len(pending):
        report_bot_failure(
            f"ทุกรายการในคิว ({len(pending)} รายการ) ล้มเหลวหมดในรอบนี้ — "
            "อาจมีปัญหาระบบ ไม่ใช่แค่รายการเดียว กรุณาตรวจสอบ log/ชีต RPA_Log"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run", action="store_true",
        help="กรอกฟอร์มทดสอบทุกรายการแต่ไม่กดบันทึกจริง และไม่แก้สถานะในเว็บแอป",
    )
    args = parser.parse_args()

    if not acquire_lock():
        log.warning("มีบอทอีกตัวกำลังทำงานอยู่แล้ว (ตรวจพบจากไฟล์ .bot.lock) — ข้ามรอบนี้ไปก่อน กันบันทึกซ้ำซ้อนใน RMS")
        sys.exit(0)
    try:
        run(dry_run=args.dry_run)
    finally:
        release_lock()
