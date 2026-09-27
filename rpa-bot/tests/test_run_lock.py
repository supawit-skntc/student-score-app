"""ทดสอบ run_lock.py (PIN ยืนยันก่อนรันจริง) ด้วย keyring จำลองในหน่วยความจำ — ไม่แตะ Windows Credential Manager จริง
รัน: python rpa-bot/tests/test_run_lock.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

ok = fail = 0


def t(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
    print(("ok   " if cond else "FAIL ") + name + ((f"  {extra}") if extra else ""))


class FakeKeyring:
    """เก็บใน dict ธรรมดาแทน Windows Credential Manager จริง — พฤติกรรมเหมือนจริงพอสำหรับทดสอบตรรกะ"""

    def __init__(self):
        self.store = {}

    def get_password(self, service, key):
        return self.store.get((service, key))

    def set_password(self, service, key, value):
        self.store[(service, key)] = value

    def delete_password(self, service, key):
        if (service, key) not in self.store:
            raise Exception("not found")
        del self.store[(service, key)]


import run_lock  # noqa: E402

fake = FakeKeyring()
run_lock.keyring = fake  # แทนที่โมดูล keyring จริงด้วยตัวจำลอง (เหมือนที่ test_bot_lock_and_session.py ทำกับ tasklist)

t("no pin set initially", run_lock.has_pin() is False)
t("verify against unset pin always False", run_lock.verify_pin("1234") is False)
t("verify empty string against unset pin False", run_lock.verify_pin("") is False)

try:
    run_lock.set_pin("12")
    t("short pin rejected", False)
except ValueError as e:
    t("short pin rejected", "อย่างน้อย" in str(e))

try:
    run_lock.set_pin("x" * 25)
    t("too-long pin rejected", False)
except ValueError:
    t("too-long pin rejected", True)

run_lock.set_pin("2468")
t("has_pin true after set", run_lock.has_pin() is True)
t("correct pin verifies", run_lock.verify_pin("2468") is True)
t("wrong pin rejected", run_lock.verify_pin("2469") is False)
t("empty pin rejected once set", run_lock.verify_pin("") is False)
t("pin is not stored in plain text", "2468" not in fake.store[(run_lock.SERVICE, run_lock.PIN_HASH_KEY)])

# เปลี่ยน PIN ใหม่ — PIN เดิมต้องใช้ไม่ได้ทันที (salt สุ่มใหม่ด้วยทุกครั้ง)
old_stored = fake.store[(run_lock.SERVICE, run_lock.PIN_HASH_KEY)]
run_lock.set_pin("999999")
new_stored = fake.store[(run_lock.SERVICE, run_lock.PIN_HASH_KEY)]
t("changing pin rewrites stored hash with a new salt", new_stored != old_stored)
t("old pin no longer works after change", run_lock.verify_pin("2468") is False)
t("new pin works after change", run_lock.verify_pin("999999") is True)

run_lock.clear_pin()
t("has_pin false after clear", run_lock.has_pin() is False)
t("verify false after clear even with the old correct pin", run_lock.verify_pin("999999") is False)
t("clearing an already-cleared pin does not raise", run_lock.clear_pin() is None)

# ข้อมูลเสีย/แปลกในที่เก็บต้องไม่ทำให้พัง (แค่ปฏิเสธ)
fake.store[(run_lock.SERVICE, run_lock.PIN_HASH_KEY)] = "not-a-valid-format"
t("malformed stored value -> verify returns False, no crash", run_lock.verify_pin("anything") is False)
fake.store[(run_lock.SERVICE, run_lock.PIN_HASH_KEY)] = "zz:zz"
t("non-hex stored value -> verify returns False, no crash", run_lock.verify_pin("anything") is False)


# keyring ที่ throw exception ทุกการเรียก (เช่น Credential Manager เข้าไม่ได้ชั่วคราว) ต้องไม่ทำให้โปรแกรมพัง
class BrokenKeyring:
    def get_password(self, *a):
        raise RuntimeError("boom")

    def set_password(self, *a):
        raise RuntimeError("boom")

    def delete_password(self, *a):
        raise RuntimeError("boom")


run_lock.keyring = BrokenKeyring()
t("has_pin survives a broken keyring backend", run_lock.has_pin() is False)
t("verify_pin survives a broken keyring backend", run_lock.verify_pin("2468") is False)
try:
    run_lock.clear_pin()
    t("clear_pin survives a broken keyring backend", True)
except Exception as e:
    t("clear_pin survives a broken keyring backend", False, str(e))

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
