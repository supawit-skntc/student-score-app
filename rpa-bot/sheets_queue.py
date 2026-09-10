"""
sheets_queue.py — อ่าน/เขียนคิวงานผ่าน GAS Web App API เดียวกับที่หน้าเว็บ React
ใช้อยู่แล้ว (ไม่ใช้ Google Cloud Service Account)

ตั้งค่าก่อนใช้: รัน setup_credentials.py หนึ่งครั้ง (หรือดับเบิลคลิก
setup_credentials.bat) จะถามรหัสผ่านแล้วเก็บไว้ใน Windows Credential Manager ให้
อัตโนมัติ — ไฟล์นี้จะดึงมาใช้เองทุกครั้งที่รัน ไม่ต้องตั้ง environment variable
หรือแก้ไฟล์ .env เอง
"""

import json
import keyring
import requests

GAS_API_URL = "https://script.google.com/macros/s/AKfycbwFEsrUnTKvlAP8y9nYbFBZ3DJa6IB0boS_12UYJbZ0b4RCgJUpaxUumGs-FY5GUfI/exec"
SERVICE = "rms-rpa-bot"
APP_USERNAME = keyring.get_password(SERVICE, "app_username")
APP_PASSWORD = keyring.get_password(SERVICE, "app_password")

_token = None  # cache ไว้ในหน่วยความจำระหว่างการรันครั้งนี้ ไม่ต้อง login ซ้ำทุกคำขอ


def _post(action: str, **extra) -> dict:
    payload = {"action": action, "token": _token, **extra}
    resp = requests.post(
        GAS_API_URL,
        data=json.dumps(payload),
        headers={"Content-Type": "text/plain;charset=utf-8"},
        timeout=30,
    )
    resp.raise_for_status()
    try:
        return resp.json()
    except ValueError:
        # เซิร์ฟเวอร์ตอบกลับมาไม่ใช่ JSON เลย (เช่น หน้า HTML ของ Google ที่ขอให้ login/
        # ขอสิทธิ์ก่อน) มักเกิดจากตั้งค่า deployment ผิด — ดูสาเหตุที่พบบ่อยใน README
        # หัวข้อ "แก้ปัญหา JSONDecodeError" แสดงเนื้อหาจริงที่ได้กลับมาไว้ช่วยวินิจฉัย
        snippet = resp.text[:300].replace("\n", " ")
        raise RuntimeError(
            f"เซิร์ฟเวอร์ไม่ได้ตอบกลับเป็น JSON (HTTP {resp.status_code}) — "
            f"อาจเป็นเพราะตั้งค่า deployment เป็น 'Anyone within organization' "
            f"แทนที่จะเป็น 'Anyone' เนื้อหาที่ได้กลับมาจริง: {snippet}"
        )


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
        import logging
        logging.getLogger("sheets_queue").warning("บันทึก RPA_Log ไม่สำเร็จ (ไม่กระทบผลลัพธ์หลัก): %s", e)
