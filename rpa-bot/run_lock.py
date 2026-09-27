"""
run_lock.py — PIN ยืนยันตัวตนก่อน "รันจริง" ด้วยมือ (ไม่บังคับ)

คอมเมนต์จากอาจารย์ผู้เชี่ยวชาญ (27/9/69): กังวลว่าถ้ามีใครเดินมาเจอโปรแกรมที่เปิดค้างอยู่บนเครื่องที่
ล็อกอิน Windows ไว้แล้ว (เช่น ลืมล็อกหน้าจอ) จะกดปุ่ม "รันจริง" ได้ทันทีโดยไม่ได้รับอนุญาต — โมดูลนี้เพิ่ม
เลเยอร์กันอีกชั้นเฉพาะจุดนั้น: ถ้าตั้ง PIN ไว้ ต้องกรอก PIN ให้ถูกก่อนกด "รันจริง" ด้วยมือทุกครั้ง

ไม่เกี่ยวกับบัญชี EDMS/RMS เลย (คนละคีย์ในที่เก็บเดียวกัน) และไม่บังคับตั้ง — ถ้าไม่ตั้ง ปุ่ม "รันจริง"
ทำงานเหมือนเดิมทุกประการ (ดู bot_gui.py) และไม่กระทบการรันอัตโนมัติตามเวลา (schedule_logic.py) เพราะรอบนั้น
ผู้ใช้ยืนยันไว้ล่วงหน้าแล้วตอนเปิดสวิตช์ "รันจริงอัตโนมัติตามเวลา" — ให้หยุดถามซ้ำทุกรอบจะทำให้ฟีเจอร์
รันอัตโนมัติใช้งานไม่ได้จริง (ไม่มีคนนั่งรอกรอก PIN ตอนเที่ยงคืน)

เก็บเป็นแฮช PBKDF2-SHA256 + salt สุ่มต่อเครื่องใน Windows Credential Manager (ที่เดียวกับรหัสผ่านอื่นของบอท)
ไม่เก็บ PIN เป็นข้อความล้วน และเทียบผลแฮชแบบเวลาคงที่ (hmac.compare_digest) กันการโจมตีแบบ timing attack
"""
import hashlib
import hmac
import os

import keyring

SERVICE = "rms-rpa-bot"
PIN_HASH_KEY = "run_pin_hash"  # เก็บเป็นข้อความเดียว "<salt เป็น hex>:<แฮชเป็น hex>"
PBKDF2_ITERATIONS = 200_000
MIN_PIN_LENGTH = 4
MAX_PIN_LENGTH = 20


def _hash_pin(pin: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, PBKDF2_ITERATIONS)


def has_pin() -> bool:
    """True ถ้าตั้ง PIN ไว้แล้ว — อ่านพังไม่ควรทำให้ทั้งโปรแกรมพัง จึงถือว่า "ยังไม่ได้ตั้ง" (ปลอดภัยน้อยกว่า
    แต่ไม่ล็อกผู้ใช้ออกจากโปรแกรมตัวเองเพราะ Credential Manager อ่านชั่วคราวไม่ได้)"""
    try:
        return bool(keyring.get_password(SERVICE, PIN_HASH_KEY))
    except Exception:
        return False


def validate_pin_format(pin: str):
    """คืนข้อความข้อผิดพลาดภาษาไทย หรือ None ถ้ารูปแบบใช้ได้"""
    pin = (pin or "").strip()
    if len(pin) < MIN_PIN_LENGTH:
        return f"PIN ต้องมีอย่างน้อย {MIN_PIN_LENGTH} ตัวอักษร"
    if len(pin) > MAX_PIN_LENGTH:
        return f"PIN ยาวเกินไป (ไม่เกิน {MAX_PIN_LENGTH} ตัวอักษร)"
    return None


def set_pin(pin: str) -> None:
    """ตั้ง/เปลี่ยน PIN — สุ่ม salt ใหม่ทุกครั้ง (เปลี่ยน PIN แล้ว PIN เก่าใช้ไม่ได้ทันที)"""
    pin = (pin or "").strip()
    err = validate_pin_format(pin)
    if err:
        raise ValueError(err)
    salt = os.urandom(16)
    digest = _hash_pin(pin, salt)
    keyring.set_password(SERVICE, PIN_HASH_KEY, salt.hex() + ":" + digest.hex())


def clear_pin() -> None:
    """ปิดการใช้ PIN — ปุ่ม "รันจริง" กลับไปทำงานทันทีเหมือนก่อนตั้ง PIN ไม่มี error ถ้ายังไม่เคยตั้งไว้"""
    try:
        keyring.delete_password(SERVICE, PIN_HASH_KEY)
    except Exception:
        pass


def verify_pin(pin: str) -> bool:
    """True เฉพาะเมื่อกรอก PIN ตรงกับที่ตั้งไว้ — ถ้ายังไม่เคยตั้ง PIN เลยคืน False เสมอ (ฝั่งเรียกต้องเช็ก
    has_pin() ก่อนเพื่อรู้ว่าจะถามหรือไม่ ไม่ใช่ตีความ False ตรงนี้ว่า "ไม่มี PIN เลยผ่านได้")"""
    try:
        stored = keyring.get_password(SERVICE, PIN_HASH_KEY)
    except Exception:
        return False
    if not stored or ":" not in stored:
        return False
    salt_hex, hash_hex = stored.split(":", 1)
    try:
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
    except ValueError:
        return False
    actual = _hash_pin(pin or "", salt)
    return hmac.compare_digest(actual, expected)
