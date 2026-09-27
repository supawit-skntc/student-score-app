"""ทดสอบ run_lock.py (PIN ยืนยันก่อนรันจริง, ตั้งได้หลายชุด) ด้วย keyring จำลองในหน่วยความจำ — ไม่แตะ
Windows Credential Manager จริง
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
run_lock.keyring = fake

t("no pin set initially", run_lock.has_pin() is False)
t("list_pins empty initially", run_lock.list_pins() == [])
t("verify against no pins always None", run_lock.verify_pin("1234") is None)
t("verify empty string against no pins None", run_lock.verify_pin("") is None)

try:
    run_lock.add_pin("ครูเอ", "12")
    t("short pin rejected", False)
except ValueError as e:
    t("short pin rejected", "อย่างน้อย" in str(e))

try:
    run_lock.add_pin("ครูเอ", "x" * 25)
    t("too-long pin rejected", False)
except ValueError:
    t("too-long pin rejected", True)

try:
    run_lock.add_pin("   ", "24680")
    t("blank name rejected", False)
except ValueError as e:
    t("blank name rejected", "ชื่อ" in str(e))
t("a rejected add_pin call did not leave a stray entry", run_lock.list_pins() == [])

run_lock.add_pin("ครูเอ", "2468")
t("has_pin true after first add", run_lock.has_pin() is True)
t("list_pins shows the new name", run_lock.list_pins() == ["ครูเอ"])
t("correct pin verifies and returns the owner's name", run_lock.verify_pin("2468") == "ครูเอ")
t("wrong pin returns None", run_lock.verify_pin("2469") is None)
t("empty pin rejected once set", run_lock.verify_pin("") is None)
stored_raw = fake.store[(run_lock.SERVICE, run_lock.PINS_KEY)]
t("pin is not stored in plain text", "2468" not in stored_raw)

# ---------------------------------------------------------------- หลายชุด แยกชื่อ แยก PIN
run_lock.add_pin("หัวหน้าแผนก", "13579")
t("list_pins keeps insertion order for multiple entries", run_lock.list_pins() == ["ครูเอ", "หัวหน้าแผนก"])
t("first owner's pin still verifies after a second is added", run_lock.verify_pin("2468") == "ครูเอ")
t("second owner's pin verifies to their own name", run_lock.verify_pin("13579") == "หัวหน้าแผนก")
t("a pin that matches nobody returns None even with 2 entries set", run_lock.verify_pin("00000") is None)

try:
    run_lock.add_pin("ครูเอ", "99999")
    t("duplicate name (case/space-insensitive) rejected", False)
except ValueError as e:
    t("duplicate name (case/space-insensitive) rejected", "มีชื่อ" in str(e))
try:
    run_lock.add_pin("  ครูเอ  ", "99999")
    t("duplicate name with surrounding whitespace also rejected", False)
except ValueError:
    t("duplicate name with surrounding whitespace also rejected", True)

for i in range(run_lock.MAX_PINS - 2):
    run_lock.add_pin(f"พนักงาน{i}", "24680")
t("can fill up to MAX_PINS entries", len(run_lock.list_pins()) == run_lock.MAX_PINS)
try:
    run_lock.add_pin("เกินโควตา", "24680")
    t("adding beyond MAX_PINS rejected", False)
except ValueError as e:
    t("adding beyond MAX_PINS rejected", "สูงสุด" in str(e))

# ---------------------------------------------------------------- ลบทีละชุด
run_lock.remove_pin("หัวหน้าแผนก")
t("removed name no longer verifies", run_lock.verify_pin("13579") is None)
t("removed name gone from list_pins", "หัวหน้าแผนก" not in run_lock.list_pins())
t("other entries untouched by removing one", run_lock.verify_pin("2468") == "ครูเอ")
t("removing a name that never existed does not raise", run_lock.remove_pin("ไม่มีจริง") is None)

run_lock.clear_all_pins()
t("has_pin false after clear_all_pins", run_lock.has_pin() is False)
t("list_pins empty after clear_all_pins", run_lock.list_pins() == [])
t("verify None after clear even with a previously-correct pin", run_lock.verify_pin("2468") is None)
t("clearing an already-cleared set does not raise", run_lock.clear_all_pins() is None)

# ---------------------------------------------------------------- ย้าย PIN ชุดเดียวรุ่นเก่าอัตโนมัติ
import hashlib  # noqa: E402

legacy_salt = b"\x01" * 16
legacy_hash = hashlib.pbkdf2_hmac("sha256", b"778899", legacy_salt, run_lock.PBKDF2_ITERATIONS)
fake.store[(run_lock.SERVICE, run_lock.LEGACY_PIN_KEY)] = legacy_salt.hex() + ":" + legacy_hash.hex()
t("legacy single-pin value migrates into the new list automatically", run_lock.list_pins() == [run_lock.LEGACY_PIN_NAME])
t("migrated legacy pin still verifies with its original value", run_lock.verify_pin("778899") == run_lock.LEGACY_PIN_NAME)
t("legacy key removed after a successful migration", fake.store.get((run_lock.SERVICE, run_lock.LEGACY_PIN_KEY)) is None)
run_lock.clear_all_pins()

# ข้อมูลเสีย/แปลกในที่เก็บต้องไม่ทำให้พัง (แค่ปฏิเสธ)
fake.store[(run_lock.SERVICE, run_lock.PINS_KEY)] = "not-json-at-all"
t("malformed stored value -> list_pins empty, no crash", run_lock.list_pins() == [])
fake.store[(run_lock.SERVICE, run_lock.PINS_KEY)] = '[{"name": "x", "salt": "zz", "hash": "zz"}]'
t("non-hex stored entry -> verify returns None, no crash", run_lock.verify_pin("anything") is None)
fake.store[(run_lock.SERVICE, run_lock.PINS_KEY)] = "42"
t("stored value not a list -> list_pins empty, no crash", run_lock.list_pins() == [])


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
t("list_pins survives a broken keyring backend", run_lock.list_pins() == [])
t("verify_pin survives a broken keyring backend", run_lock.verify_pin("2468") is None)
try:
    run_lock.clear_all_pins()
    t("clear_all_pins survives a broken keyring backend", True)
except Exception as e:
    t("clear_all_pins survives a broken keyring backend", False, str(e))
try:
    run_lock.add_pin("x", "24680")
    t("add_pin surfaces (not swallows) a broken keyring backend on write", False)
except RuntimeError:
    t("add_pin surfaces (not swallows) a broken keyring backend on write", True)

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
