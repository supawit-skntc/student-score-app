"""
sheets_queue.py — อ่าน/เขียนคิวงานผ่าน GAS Web App API เดียวกับที่หน้าเว็บ React
ใช้อยู่แล้ว (ไม่ใช้ Google Cloud Service Account)

ตั้งค่าก่อนใช้: รัน setup_credentials.py หนึ่งครั้ง (หรือดับเบิลคลิก
setup_credentials.bat) จะถามรหัสผ่านแล้วเก็บไว้ใน Windows Credential Manager ให้
อัตโนมัติ — ไฟล์นี้จะดึงมาใช้เองทุกครั้งที่รัน ไม่ต้องตั้ง environment variable
หรือแก้ไฟล์ .env เอง
"""

import json
import logging
import time

import keyring
import requests

GAS_API_URL = "https://script.google.com/macros/s/AKfycby-im5XJIHfYwTfeIc1Da6d4IjYjs6nwl_8dV8C_9IfMuGjksPxC1NaDkBjC_PS-xuT/exec"
SERVICE = "rms-rpa-bot"
APP_USERNAME = keyring.get_password(SERVICE, "app_username")
APP_PASSWORD = keyring.get_password(SERVICE, "app_password")

_token = None  # cache ไว้ในหน่วยความจำระหว่างการรันครั้งนี้ ไม่ต้อง login ซ้ำทุกคำขอ
_log = logging.getLogger("sheets_queue")

# เจอมาแล้วอย่างน้อย 2 ครั้งว่า Google เด้งหน้า HTML (ไม่ใช่ JSON) กลับมาเฉยๆ
# เป็นครั้งคราวโดยไม่มีสาเหตุจากโค้ดเราเลย (เช่น ตอนกำลังรันบอทจริงแล้วยิง
# updateSyncStatus รัวๆ) ลองใหม่ไม่กี่ครั้งก่อนค่อยถือว่าพังจริง ลดโอกาสที่ปัญหา
# ชั่วคราวแบบนี้จะทำให้ทั้งการรันบอทล้มไปเฉยๆ
RETRY_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 2


def _warn_and_wait(action: str, attempt: int, error: Exception) -> None:
    wait_seconds = RETRY_BACKOFF_SECONDS * attempt
    _log.warning(
        "เรียก action '%s' ไม่สำเร็จ (ครั้งที่ %d/%d): %s — ลองใหม่ใน %d วินาที",
        action, attempt, RETRY_ATTEMPTS, error, wait_seconds,
    )
    time.sleep(wait_seconds)


def _post(action: str, **extra) -> dict:
    payload = {"action": action, "token": _token, **extra}

    for attempt in range(1, RETRY_ATTEMPTS + 1):
        is_last_attempt = attempt == RETRY_ATTEMPTS

        try:
            resp = requests.post(
                GAS_API_URL,
                data=json.dumps(payload),
                headers={"Content-Type": "text/plain;charset=utf-8"},
                timeout=30,
            )
            resp.raise_for_status()
        except requests.RequestException as e:
            if is_last_attempt:
                raise RuntimeError(f"เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จหลังลองแล้ว {RETRY_ATTEMPTS} ครั้ง: {e}") from e
            _warn_and_wait(action, attempt, e)
            continue

        try:
            return resp.json()
        except ValueError as e:
            # เซิร์ฟเวอร์ตอบกลับมาไม่ใช่ JSON เลย (เช่น หน้า HTML ของ Google ที่ขอให้ login/
            # ขอสิทธิ์ก่อน) — ส่วนใหญ่เป็นปัญหาชั่วคราวของ Google เอง (หายไปเองพอลองใหม่)
            # จึงลองซ้ำก่อนจะฟันธงว่าพังจริงเพราะตั้งค่า deployment ผิด
            if not is_last_attempt:
                _warn_and_wait(action, attempt, e)
                continue
            snippet = resp.text[:300].replace("\n", " ")
            raise RuntimeError(
                f"เซิร์ฟเวอร์ไม่ได้ตอบกลับเป็น JSON (HTTP {resp.status_code}) หลังลองแล้ว {RETRY_ATTEMPTS} ครั้ง — "
                f"ถ้ายังเจอซ้ำๆ อาจเป็นเพราะตั้งค่า deployment เป็น 'Anyone within organization' "
                f"แทนที่จะเป็น 'Anyone' เนื้อหาที่ได้กลับมาจริง: {snippet}"
            ) from e


def _ensure_login() -> None:
    global _token
    if _token:
        return
    if not APP_USERNAME or not APP_PASSWORD:
        raise RuntimeError(
            "ยังไม่ได้ตั้งค่าบัญชีเว็บแอป EDMS สำหรับบอท — "
            "รัน setup_credentials.py (หรือดับเบิลคลิก setup_credentials.bat) ก่อนครับ"
        )
    result = _post("login", username=APP_USERNAME, password=APP_PASSWORD)
    if result.get("status") != "success":
        raise RuntimeError(f"ล็อกอินเข้าเว็บแอปไม่สำเร็จ: {result.get('message')}")
    _token = result["token"]


def get_pending_records() -> list[dict]:
    """คืนค่ารายการทั้งหมดที่สถานะ = 'pending' สดใหม่จาก GAS ทุกครั้งที่เรียก"""
    _ensure_login()
    result = _post("getSyncQueue")
    if result.get("status") != "success":
        raise RuntimeError(f"ดึงคิวไม่สำเร็จ: {result.get('message')}")
    return result.get("data", [])


def update_status(record_id: str, status: str, note: str = "") -> None:
    """เขียนผลลัพธ์กลับทันทีหลังประมวลผลแต่ละรายการ (main.py เรียกทีละรายการ
    ไม่รอ batch ตอนจบ) เพื่อกันรายการที่ทำสำเร็จแล้วถูกดึงมาทำซ้ำรอบหน้า"""
    _ensure_login()
    result = _post("updateSyncStatus", data={"id": record_id, "status": status, "note": note})
    if result.get("status") != "success":
        raise RuntimeError(f"อัปเดตสถานะไม่สำเร็จ: {result.get('message')}")


def log_event(record_id: str, student_id: str, offense: str, status: str,
              message: str = "", duration_seconds: float | None = None) -> None:
    """บันทึกประวัติการทำงานลงชีต 'RPA_Log' แยกต่างหาก (สร้างอัตโนมัติถ้ายังไม่มี)
    เก็บทุกครั้งที่ประมวลผล ไม่ทับของเดิม — ต่างจาก update_status ที่เก็บแค่สถานะ
    ล่าสุดของแต่ละรายการ ที่นี่เก็บเป็นประวัติสะสม มีเวลาที่ใช้ต่อรายการด้วย ใช้เป็น
    ข้อมูลจริงสำหรับเปรียบเทียบประสิทธิภาพในงานวิจัยได้เลย (ตัวแปรตามข้อ 'ระยะเวลา')

    ไม่ raise error ถ้าบันทึก log ไม่สำเร็จ เพราะไม่อยากให้การบันทึก log ที่ล้มเหลว
    ไปทำให้ทั้งการรันบอทดูเหมือนล้มเหลวไปด้วย (แค่ warning ไว้ก็พอ)"""
    try:
        _ensure_login()
        _post("logRpaEvent", data={
            "recordId": record_id,
            "studentId": student_id,
            "offense": offense,
            "status": status,
            "message": message,
            "durationSeconds": round(duration_seconds, 1) if duration_seconds is not None else "",
        })
    except Exception as e:
        _log.warning("บันทึก RPA_Log ไม่สำเร็จ (ไม่กระทบผลลัพธ์หลัก): %s", e)


def report_bot_failure(message: str) -> None:
    """แจ้งผู้ดูแลระบบทางอีเมลเมื่อบอททั้ง batch ล้มเหลว (เช่น login RMS ไม่สำเร็จ
    ตั้งแต่ต้น หรือทุกรายการในคิวพังหมดในรอบเดียว) — บอทรันแบบไม่มีคนเฝ้า (Task
    Scheduler) เดิมถ้าเจอปัญหาแบบนี้จะไม่มีใครรู้เลยจนกว่าจะมีคนสังเกตว่า "รอ
    บันทึกเข้า RMS" ในแดชบอร์ดค้างเพิ่มขึ้นเรื่อยๆ

    ใช้ช่องทางแจ้งเตือนเดียวกับที่ฝั่งเว็บมีอยู่แล้ว (ดู notifyAdminOfError_ ใน
    Service_Ops.gs ผ่าน action ใหม่ "reportBotFailure" ใน Service_RpaBot.gs) ได้
    cooldown กันสแปม/ตั้งค่าอีเมลผู้รับมาฟรีๆ ไม่ต้องทำระบบแจ้งเตือนแยกอีกชุด

    ไม่ raise error ถ้าแจ้งไม่สำเร็จ (เช่น อินเทอร์เน็ตหลุดพอดี) เพราะไม่อยากให้
    การแจ้งเตือนที่ล้มเหลว ไปบัง error จริงที่ main.py กำลังจะ log/raise อยู่แล้ว"""
    try:
        _ensure_login()
        _post("reportBotFailure", data={"message": message})
    except Exception as e:
        _log.warning("แจ้งเตือนผู้ดูแลระบบไม่สำเร็จ (ไม่กระทบผลลัพธ์หลัก): %s", e)
