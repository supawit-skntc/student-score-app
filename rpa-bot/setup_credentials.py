"""
setup_credentials.py — ตั้งค่าบัญชี RPA Bot ครั้งเดียว (ทำแทนการแก้ไฟล์ .env เอง)

รันไฟล์นี้ครั้งเดียว (ดับเบิลคลิก setup_credentials.bat หรือ python setup_credentials.py)
จะถามรหัสผ่านทีละตัว (พิมพ์แล้วไม่โชว์บนจอ ป้องกันคนแอบดู) แล้วเก็บไว้ใน
Windows Credential Manager ซึ่งเข้ารหัสไว้แล้วโดย Windows เอง — ปลอดภัยกว่าไฟล์ .env
ที่เป็นข้อความธรรมดาเปิดอ่านได้ทันทีถ้ามีใครเปิดไฟล์ดู

หลังตั้งค่าแล้ว ไม่ต้องยุ่งกับไฟล์ .env หรือ environment variable อีกเลย
main.py และ rms_bot.py จะดึงรหัสผ่านจากตรงนี้โดยอัตโนมัติทุกครั้งที่รัน
"""

import getpass
import keyring

SERVICE = "rms-rpa-bot"

FIELDS = [
    ("app_username", "ชื่อผู้ใช้งานเว็บแอป EDMS (บัญชีที่สร้างในหน้า 'จัดการผู้ใช้งาน')", False),
    ("app_password", "รหัสผ่านเว็บแอป EDMS", True),
    ("rms_username", "ชื่อผู้ใช้งานสำหรับล็อกอินระบบ RMS จริง", False),
    ("rms_password", "รหัสผ่าน RMS จริง", True),
]


def prompt_and_store(key: str, label: str, is_secret: bool) -> None:
    existing = keyring.get_password(SERVICE, key)
    if existing:
        choice = input(f"[{label}] มีค่าอยู่แล้ว ต้องการเปลี่ยนหรือไม่? (y/N): ").strip().lower()
        if choice != "y":
            print("  -> ข้ามไป ใช้ค่าเดิม\n")
            return

    if is_secret:
        value = getpass.getpass(f"กรอก {label}: ")
    else:
        value = input(f"กรอก {label}: ")

    if not value:
        print("  -> ไม่ได้กรอกอะไร ข้ามไปก่อน (รันใหม่ได้ทีหลัง)\n")
        return

    keyring.set_password(SERVICE, key, value)
    print(f"  -> บันทึก '{label}' เรียบร้อยแล้ว (เก็บอย่างปลอดภัยใน Windows Credential Manager)\n")


if __name__ == "__main__":
    print("=" * 50)
    print("  ตั้งค่าบัญชีสำหรับ RPA Bot (ทำครั้งเดียวพอ)")
    print("=" * 50)
    print()

    for key, label, is_secret in FIELDS:
        prompt_and_store(key, label, is_secret)

    print("=" * 50)
    print("  ตั้งค่าเสร็จสมบูรณ์แล้ว")
    print("  ต่อไปดับเบิลคลิก run_bot.bat หรือ run_bot_dryrun.bat ได้เลย")
    print("  ไม่ต้องตั้งค่าอะไรเพิ่มอีก")
    print("=" * 50)
    input("\nกด Enter เพื่อปิดหน้าต่างนี้")
