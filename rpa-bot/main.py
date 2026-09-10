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
import time

from sheets_queue import get_pending_records, update_status, log_event
from rms_bot import process_one_record

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("main")

STATUS_MAP = {
    "submitted": "synced",
    "synced": "synced",
    "needs_review": "needs_review",
    "error": "error",
}


def run(dry_run: bool) -> None:
    pending = get_pending_records()
    log.info("พบ %d รายการรอดำเนินการ", len(pending))

    if not pending:
        return

    counts = {"synced": 0, "needs_review": 0, "error": 0, "dry_run": 0}

    for record in pending:
        log.info("--- กำลังประมวลผล %s (นักเรียน %s) ---", record["id"], record["studentId"])
        started_at = time.time()
        outcome = process_one_record(record, dry_run=dry_run)
        duration_seconds = time.time() - started_at
        result_status = outcome["status"]

        if dry_run:
            counts["dry_run"] += 1
            log.info("[DRY RUN] ผลลัพธ์: %s (%.1f วินาที) — ไม่บันทึก log เพราะเป็นการทดสอบ", outcome, duration_seconds)
            continue

        sheet_status = STATUS_MAP.get(result_status, "error")
        counts[sheet_status] = counts.get(sheet_status, 0) + 1
        update_status(record["id"], sheet_status, outcome.get("message", ""))
        log_event(
            record_id=record["id"], student_id=record["studentId"], offense=record["offense"],
            status=sheet_status, message=outcome.get("message", ""), duration_seconds=duration_seconds,
        )
        log.info("บันทึกสถานะ '%s' กลับไปที่เว็บแอปแล้ว (ใช้เวลา %.1f วินาที)", sheet_status, duration_seconds)

        # เว้นช่วงสั้นๆ ระหว่างรายการ ลดโอกาสที่เซสชันเดิมจะยังค้างอยู่ตอน login รอบถัดไป
        # และไม่ยิง request รัวเกินไปจนอาจโดนระบบ RMS มองเป็นพฤติกรรมผิดปกติ
        if record is not pending[-1]:
            time.sleep(3)

    log.info("=== สรุปผล ===")
    for status, count in counts.items():
        if count:
            log.info("  %s: %d รายการ", status, count)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dry-run", action="store_true",
        help="กรอกฟอร์มทดสอบทุกรายการแต่ไม่กดบันทึกจริง และไม่แก้สถานะในเว็บแอป",
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run)
