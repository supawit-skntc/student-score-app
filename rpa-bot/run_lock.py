"""
run_lock.py — PIN ยืนยันตัวตนก่อน "รันจริง" ด้วยมือ (ไม่บังคับ, ตั้งได้หลายชุด)

คอมเมนต์จากอาจารย์ผู้เชี่ยวชาญ (27/9/69): กังวลว่าถ้ามีใครเดินมาเจอโปรแกรมที่เปิดค้างอยู่บนเครื่องที่
ล็อกอิน Windows ไว้แล้ว (เช่น ลืมล็อกหน้าจอ) จะกดปุ่ม "รันจริง" ได้ทันทีโดยไม่ได้รับอนุญาต — โมดูลนี้เพิ่ม
เลเยอร์กันอีกชั้นเฉพาะจุดนั้น: ถ้าตั้ง PIN ไว้อย่างน้อย 1 ชุด ต้องกรอก PIN ที่ตรงชุดใดชุดหนึ่งให้ถูกก่อนกด
"รันจริง" ด้วยมือทุกครั้ง — จุดประสงค์คือยกระดับจาก "ใครก็คลิกรันได้ทันที" เป็น "ต้องรู้ความลับ (PIN) ก่อน"
ไม่ได้อ้างว่ากันได้ 100% (ยังไม่ใช่การยืนยันตัวตนแบบมีบัญชีแยกรายคน) แต่ปิดช่องโหว่ที่อาจารย์กังวลได้ตรงจุด

คำถามผู้ใช้ (28/9/69): "ถ้าคนรับผิดชอบหลักไม่อยู่ คนอื่น (เช่นหัวหน้าแผนก) จะรันแทนได้ไหม" — เดิมมี PIN
ได้ชุดเดียว ทำให้ทุกคนต้องรู้ PIN เดียวกัน (แชร์กัน = ไม่รู้ว่าใครรันจริง) ตอนนี้ตั้งได้หลายชุด แยกชื่อ
เจ้าของ ใครใช้ PIN ของตัวเองรันก็ได้โดยไม่ต้องรู้ PIN ของคนอื่น — verify_pin() คืน "ชื่อ" ของ PIN ที่ตรง
กลับไป เอาไปบันทึกลงคอนโซล/ล็อกได้ว่าใครเป็นคนยืนยันรันรอบนั้น (ดู bot_gui.py._run_bot)

ไม่เกี่ยวกับบัญชี EDMS/RMS เลย (คนละคีย์ในที่เก็บเดียวกัน) — "ทดสอบ" ใช้งานได้เสมอไม่ว่าจะตั้ง PIN ไว้หรือไม่
แต่ตั้งแต่คำขอผู้ใช้ 28/9/69 ปุ่ม "รันจริง" (กดเองหรือเปิดสวิตช์อัตโนมัติตามเวลา) ถูกบล็อกไว้เลยจนกว่าจะตั้ง
PIN ไว้อย่างน้อย 1 ชุดก่อน (ดู bot_gui.py._run_bot/_on_schedule_toggle) — รอบรันอัตโนมัติแต่ละรอบเองไม่ถาม
ซ้ำ เพราะยืนยันไว้ล่วงหน้าแล้วตอนเปิดสวิตช์นั้น (ให้หยุดถามซ้ำทุกรอบจะทำให้ฟีเจอร์รันอัตโนมัติใช้งานไม่ได้จริง
— ไม่มีคนนั่งรอกรอก PIN ตอนเที่ยงคืน)

เก็บเป็นแฮช PBKDF2-SHA256 + salt สุ่มต่อ "ชุด" ใน Windows Credential Manager (ที่เดียวกับรหัสผ่านอื่นของบอท)
ไม่เก็บ PIN เป็นข้อความล้วน และเทียบผลแฮชแบบเวลาคงที่ (hmac.compare_digest) กันการโจมตีแบบ timing attack
"""
import hashlib
import hmac
import json
import os
import time

import keyring

SERVICE = "rms-rpa-bot"
PINS_KEY = "run_pins_v2"  # เก็บ JSON: [{"name":.., "salt":"hex", "hash":"hex"}, ...]
LEGACY_PIN_KEY = "run_pin_hash"  # รุ่นก่อนรองรับหลายชุด ("<salt hex>:<hash hex>") — ย้ายอัตโนมัติครั้งเดียว
LEGACY_PIN_NAME = "PIN เดิม"
PBKDF2_ITERATIONS = 200_000
MIN_PIN_LENGTH = 4
MAX_PIN_LENGTH = 20
MAX_NAME_LENGTH = 40
MAX_PINS = 10  # กันเผลอเพิ่มไม่จำกัด — แผนกเล็กๆ ไม่น่าจะต้องมีเกินนี้จริง

# 🔒 ล็อกชั่วคราวหลังกรอกผิดติดกันหลายครั้ง (ตรวจพบระหว่างตรวจสอบระบบ 28/9/69) — เดิม verify_pin() ไม่มี
# การจำกัดจำนวนครั้งเลย ผสมกับ MIN_PIN_LENGTH ต่ำสุดแค่ 4 หลัก ทำให้คนที่เจอโปรแกรมเปิดค้างอยู่ลองผิดลองถูก
# ได้ไม่จำกัดจนกว่าจะเดาถูก จำนวนนี้เก็บในหน่วยความจำของโปรเซสเท่านั้น (ไม่เขียนลงดิสก์) — ตั้งใจ: ปิดโปรแกรม
# แล้วเปิดใหม่ก็รีเซ็ตตัวนับได้ เพราะการปิด-เปิดโปรแกรมเองก็เป็นอุปสรรคที่มีความหมายอยู่แล้วสำหรับภัยคุกคามที่
# โมดูลนี้ตั้งใจกัน (คนที่บังเอิญมาเจอโปรแกรมเปิดค้างอยู่ ไม่ใช่ผู้โจมตีที่ตั้งใจ scripted brute-force)
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 30
_lockout_state = {"failed_count": 0, "locked_until": 0.0}


def seconds_until_unlock() -> float:
    """คืนจำนวนวินาทีที่เหลือก่อนกรอก PIN ได้อีกครั้ง (0 ถ้าไม่ได้ถูกล็อกอยู่) — เรียกก่อนเปิดกล่องขอ PIN
    เสมอ เพื่อบอกผู้ใช้ตรงๆ ว่าเหตุใดจึงยังกรอกไม่ได้ แทนที่จะให้เข้าใจผิดว่า PIN ผิดทุกครั้งที่ลอง"""
    remaining = _lockout_state["locked_until"] - time.time()
    return remaining if remaining > 0 else 0.0


def _hash_pin(pin: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, PBKDF2_ITERATIONS)


def _save_pins(pins: list) -> None:
    keyring.set_password(SERVICE, PINS_KEY, json.dumps(pins, ensure_ascii=False))


def _load_pins() -> list:
    """อ่านรายการ PIN ทั้งหมด — ย้าย PIN รุ่นเดียวเดิม (ถ้ามีและยังไม่เคยย้าย) มาเป็นรายการแรกให้อัตโนมัติ
    อ่าน/เขียนพังไม่ควรทำให้ทั้งโปรแกรมพัง จึงคืนลิสต์ว่างเมื่อผิดพลาด (ปลอดภัยน้อยกว่าแต่ไม่ล็อกผู้ใช้
    ออกจากโปรแกรมตัวเองเพราะ Credential Manager อ่านชั่วคราวไม่ได้)"""
    try:
        raw = keyring.get_password(SERVICE, PINS_KEY)
        pins = json.loads(raw) if raw else []
        if not isinstance(pins, list):
            pins = []
    except Exception:
        pins = []

    if not pins:
        try:
            legacy = keyring.get_password(SERVICE, LEGACY_PIN_KEY)
        except Exception:
            legacy = None
        if legacy and ":" in legacy:
            salt_hex, hash_hex = legacy.split(":", 1)
            pins = [{"name": LEGACY_PIN_NAME, "salt": salt_hex, "hash": hash_hex}]
            try:
                _save_pins(pins)
                keyring.delete_password(SERVICE, LEGACY_PIN_KEY)
            except Exception:
                pass  # ย้ายลงที่เก็บถาวรไม่สำเร็จ — ใช้ค่าที่ย้ายไว้ในหน่วยความจำไปก่อนสำหรับรอบนี้พอ

    return pins


def list_pins() -> list:
    """คืนรายชื่อ (name) ของ PIN ทั้งหมดที่ตั้งไว้ เรียงตามลำดับที่เพิ่ม — ไม่คืนตัว PIN/แฮชออกไปเด็ดขาด"""
    return [p.get("name", "") for p in _load_pins()]


def has_pin() -> bool:
    """True ถ้าตั้ง PIN ไว้อย่างน้อย 1 ชุด"""
    return len(_load_pins()) > 0


def validate_pin_format(pin: str):
    """คืนข้อความข้อผิดพลาดภาษาไทย หรือ None ถ้ารูปแบบใช้ได้"""
    pin = (pin or "").strip()
    if len(pin) < MIN_PIN_LENGTH:
        return f"PIN ต้องมีอย่างน้อย {MIN_PIN_LENGTH} ตัวอักษร"
    if len(pin) > MAX_PIN_LENGTH:
        return f"PIN ยาวเกินไป (ไม่เกิน {MAX_PIN_LENGTH} ตัวอักษร)"
    return None


def add_pin(name: str, pin: str) -> None:
    """เพิ่ม PIN ชุดใหม่ต่อท้ายรายการ ตั้งชื่อเจ้าของไว้กำกับ — ชื่อห้ามว่าง/ซ้ำ (ไม่สนตัวพิมพ์เล็ก-ใหญ่
    หรือช่องว่างหัวท้าย) และห้ามเกิน MAX_PINS ชุด — โยน ValueError พร้อมข้อความภาษาไทยถ้าไม่ผ่าน"""
    name = (name or "").strip()
    if not name:
        raise ValueError("กรุณาระบุชื่อเจ้าของ PIN")
    if len(name) > MAX_NAME_LENGTH:
        raise ValueError(f"ชื่อยาวเกินไป (ไม่เกิน {MAX_NAME_LENGTH} ตัวอักษร)")
    pin = (pin or "").strip()
    err = validate_pin_format(pin)
    if err:
        raise ValueError(err)

    pins = _load_pins()
    if len(pins) >= MAX_PINS:
        raise ValueError(f"ตั้ง PIN ได้สูงสุด {MAX_PINS} ชุด — ลบชุดที่ไม่ใช้แล้วก่อน")
    if any(p.get("name", "").strip().lower() == name.lower() for p in pins):
        raise ValueError(f'มีชื่อ "{name}" อยู่แล้ว — ใช้ชื่ออื่น หรือลบชุดเดิมก่อนถ้าต้องการตั้งใหม่')

    salt = os.urandom(16)
    digest = _hash_pin(pin, salt)
    pins.append({"name": name, "salt": salt.hex(), "hash": digest.hex()})
    _save_pins(pins)


def remove_pin(name: str) -> None:
    """ลบ PIN ชุดที่ชื่อตรงกัน (เทียบไม่สนตัวพิมพ์เล็ก-ใหญ่/ช่องว่างหัวท้าย) — ไม่มีชื่อนี้อยู่แล้วก็ไม่ error"""
    pins = _load_pins()
    key = (name or "").strip().lower()
    remaining = [p for p in pins if p.get("name", "").strip().lower() != key]
    if len(remaining) != len(pins):
        _save_pins(remaining)


def clear_all_pins() -> None:
    """ลบ PIN ทุกชุดทิ้ง — ปุ่ม "รันจริง" กลับไปทำงานทันทีเหมือนก่อนตั้ง PIN เลย ไม่มี error ถ้ายังไม่เคยตั้งไว้"""
    try:
        _save_pins([])
    except Exception:
        pass
    try:
        keyring.delete_password(SERVICE, LEGACY_PIN_KEY)
    except Exception:
        pass


def verify_pin(pin: str):
    """คืน "ชื่อ" ของ PIN ชุดแรกที่ตรงกับที่กรอก (เอาไปบันทึกลงล็อกได้ว่าใครยืนยันรันรอบนั้น) หรือ None ถ้าไม่
    ตรงชุดไหนเลย/ยังไม่เคยตั้ง PIN ไว้/กำลังถูกล็อกชั่วคราวอยู่ (กรอกผิดติดกันเกิน MAX_FAILED_ATTEMPTS ครั้ง
    — เรียก seconds_until_unlock() ก่อนเปิดกล่องขอ PIN เสมอเพื่อบอกผู้ใช้ตรงๆ) — ทุกชุดเทียบแบบเวลาคงที่
    (hmac.compare_digest) กัน timing attack"""
    if seconds_until_unlock() > 0:
        return None

    pin = pin or ""
    matched = None
    for p in _load_pins():
        try:
            salt = bytes.fromhex(p.get("salt", ""))
            expected = bytes.fromhex(p.get("hash", ""))
        except ValueError:
            continue
        actual = _hash_pin(pin, salt)
        if hmac.compare_digest(actual, expected) and matched is None:
            matched = p.get("name", "")

    if matched is None:
        _lockout_state["failed_count"] += 1
        if _lockout_state["failed_count"] >= MAX_FAILED_ATTEMPTS:
            _lockout_state["locked_until"] = time.time() + LOCKOUT_SECONDS
            _lockout_state["failed_count"] = 0
    else:
        _lockout_state["failed_count"] = 0
    return matched
