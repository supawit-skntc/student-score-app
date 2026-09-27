"""ทดสอบว่าเพิ่ม/ลบ PIN (รองรับหลายชุดแยกชื่อ) ต้องกรอก PIN ที่มีอยู่ชุดใดชุดหนึ่งให้ถูกก่อนเสมอ (ไม่งั้นใครก็ตาม
ที่มาเจอโปรแกรมเปิดค้างอยู่จะเพิ่ม/ลบ PIN เองได้โดยไม่ต้องรู้ PIN เลย ทำให้ทั้งฟีเจอร์ไม่มีความหมาย — ดู
_confirm_current_pin ใน bot_gui.py) ยกเว้นการเพิ่ม "ชุดแรก" ตอนยังไม่เคยมี PIN เลย ซึ่งไม่มีอะไรให้ยืนยัน
รัน: python rpa-bot/tests/test_bot_pin_settings_gate.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import bot_gui  # noqa: E402
import run_lock  # noqa: E402
from tkinter import messagebox  # noqa: E402

ok = fail = 0


def t(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
    print(("ok   " if cond else "FAIL ") + name + ((f"  {extra}") if extra else ""))


class FakeKeyring:
    def __init__(self):
        self.store = {}

    def get_password(self, service, key):
        return self.store.get((service, key))

    def set_password(self, service, key, value):
        self.store[(service, key)] = value

    def delete_password(self, service, key):
        del self.store[(service, key)]


fake_keyring = FakeKeyring()
run_lock.keyring = fake_keyring
bot_gui.keyring.get_password = lambda service, key: "x"  # บัญชี EDMS/RMS ครบเสมอ (ไม่เกี่ยวกับ PIN)

info_msgs, warn_msgs, error_msgs = [], [], []
messagebox.showinfo = lambda title, text: info_msgs.append((title, text))
messagebox.showwarning = lambda title, text: warn_msgs.append((title, text))
messagebox.showerror = lambda title, text: error_msgs.append((title, text))
confirm_queue = []
messagebox.askyesno = lambda title, text: confirm_queue.pop(0) if confirm_queue else True

app = bot_gui.BotControlPanel()
app.update()

pin_prompt_calls = []
pin_prompt_queue = []


def fake_pin_prompt(title, subtitle, confirm=False):
    pin_prompt_calls.append((title, confirm))
    return pin_prompt_queue.pop(0) if pin_prompt_queue else None


text_prompt_calls = []
text_prompt_queue = []


def fake_text_prompt(title, subtitle):
    text_prompt_calls.append((title, subtitle))
    return text_prompt_queue.pop(0) if text_prompt_queue else None


app._prompt_pin_dialog = fake_pin_prompt
app._prompt_text_dialog = fake_text_prompt


def reset():
    pin_prompt_calls.clear()
    pin_prompt_queue.clear()
    text_prompt_calls.clear()
    text_prompt_queue.clear()
    info_msgs.clear()
    warn_msgs.clear()
    error_msgs.clear()
    confirm_queue.clear()


# ---------------------------------------------------------------- A) ยังไม่เคยตั้ง PIN เลย — เพิ่มชุดแรกไม่ต้องยืนยันของเดิม
reset()
text_prompt_queue.append("ครูเอ")
pin_prompt_queue.append("2468")
app._on_add_pin()
t("first pin: no current-pin confirmation step (nothing to confirm yet)", len(pin_prompt_calls) == 1 and pin_prompt_calls[0][1] is True)
t("first pin: name prompt shown once", len(text_prompt_calls) == 1)
t("first pin: saved under the name given, and verifies", run_lock.list_pins() == ["ครูเอ"] and run_lock.verify_pin("2468") == "ครูเอ")

# ---------------------------------------------------------------- B) เพิ่ม PIN ชุดที่สอง โดยไม่รู้ PIN ที่มีอยู่ -> ถูกปฏิเสธ
reset()
pin_prompt_queue.append("0000")  # กรอก PIN เดิมผิด
app._on_add_pin()
t("add 2nd pin, WRONG current pin: aborted after only the current-pin dialog", len(pin_prompt_calls) == 1 and pin_prompt_calls[0][1] is False)
t("add 2nd pin, wrong current pin: never reaches the name prompt", len(text_prompt_calls) == 0)
t("add 2nd pin, wrong current pin: error shown", len(error_msgs) == 1)
t("add 2nd pin, wrong current pin: still only the first pin exists", run_lock.list_pins() == ["ครูเอ"])

# ยกเลิกตอนถูกถามหา PIN เดิม (กด "ยกเลิก") -> ไม่ถูกถามชื่อ/PIN ใหม่เลย
reset()
pin_prompt_queue.append(None)
app._on_add_pin()
t("cancelling the current-pin prompt aborts before asking for a name", len(pin_prompt_calls) == 1 and len(text_prompt_calls) == 0)
t("cancelling: still only the first pin exists", run_lock.list_pins() == ["ครูเอ"])

# ---------------------------------------------------------------- C) เพิ่ม PIN ชุดที่สอง โดยรู้ PIN ที่มีอยู่ถูกต้อง -> สำเร็จ
reset()
pin_prompt_queue.append("2468")  # PIN ที่มีอยู่ (ถูก)
text_prompt_queue.append("หัวหน้าแผนก")
pin_prompt_queue.append("13579")  # PIN ใหม่ของชุดที่สอง
app._on_add_pin()
t("add 2nd pin, correct current pin: prompted for current-pin then new-pin (2 pin dialogs)", len(pin_prompt_calls) == 2)
t("add 2nd pin: first pin dialog is NOT confirm=True (single current-pin entry)", pin_prompt_calls[0][1] is False)
t("add 2nd pin: second pin dialog IS confirm=True (new pin, entered twice)", pin_prompt_calls[1][1] is True)
t("add 2nd pin: both owners now listed", run_lock.list_pins() == ["ครูเอ", "หัวหน้าแผนก"])
t("add 2nd pin: first owner's pin still works", run_lock.verify_pin("2468") == "ครูเอ")
t("add 2nd pin: second owner's pin verifies to their own name", run_lock.verify_pin("13579") == "หัวหน้าแผนก")

# ---------------------------------------------------------------- D) เพิ่ม PIN แต่ยกเลิกตอนกรอกชื่อ -> ไม่ถูกถาม PIN ใหม่เลย
reset()
pin_prompt_queue.append("2468")
text_prompt_queue.append(None)  # กด "ยกเลิก" ตอนกรอกชื่อ
app._on_add_pin()
t("cancelling the name prompt aborts before asking for a new pin", len(pin_prompt_calls) == 1)
t("cancelling the name prompt: no new entry added", run_lock.list_pins() == ["ครูเอ", "หัวหน้าแผนก"])

# กรอกชื่อว่างเปล่า -> ถูกปฏิเสธ ไม่ถามหา PIN ใหม่
reset()
pin_prompt_queue.append("2468")
text_prompt_queue.append("   ")
app._on_add_pin()
t("blank name: rejected with a warning, no new-pin prompt", len(warn_msgs) == 1 and len(pin_prompt_calls) == 1)
t("blank name: no new entry added", run_lock.list_pins() == ["ครูเอ", "หัวหน้าแผนก"])

# ชื่อซ้ำกับที่มีอยู่ -> run_lock.add_pin ปฏิเสธเอง (แสดงคำเตือน ไม่ทับของเดิม)
reset()
pin_prompt_queue.append("2468")
text_prompt_queue.append("ครูเอ")
pin_prompt_queue.append("99999")
app._on_add_pin()
t("duplicate name: rejected with a warning", len(warn_msgs) == 1)
t("duplicate name: original pin for that name still works, not overwritten", run_lock.verify_pin("2468") == "ครูเอ")

# ---------------------------------------------------------------- E) ลบ PIN โดยไม่รู้ PIN ที่มีอยู่ -> ถูกปฏิเสธ ยังอยู่ครบ
reset()
pin_prompt_queue.append("wrong-pin")
app._on_remove_pin("หัวหน้าแผนก")
t("remove pin, wrong current pin: rejected", run_lock.list_pins() == ["ครูเอ", "หัวหน้าแผนก"])
t("remove pin, wrong current pin: error shown", len(error_msgs) == 1)

# ---------------------------------------------------------------- F) ลบ PIN ด้วย PIN ที่มีอยู่ถูกต้อง + ยืนยัน "ใช่"
reset()
pin_prompt_queue.append("2468")
confirm_queue.append(True)
app._on_remove_pin("หัวหน้าแผนก")
t('remove pin with correct current pin + confirm yes: "หัวหน้าแผนก" removed, "ครูเอ" stays', run_lock.list_pins() == ["ครูเอ"])
t("removed owner's pin no longer verifies", run_lock.verify_pin("13579") is None)

# ---------------------------------------------------------------- G) ลบ PIN ที่เหลืออยู่ชุดสุดท้าย แต่กด "ไม่ยืนยัน" ตอนถามซ้ำ
reset()
pin_prompt_queue.append("2468")
confirm_queue.append(False)  # กด "ยกเลิก" ตอนถามยืนยันลบ
app._on_remove_pin("ครูเอ")
t("remove: correct pin but declines the final yes/no -> entry stays", run_lock.list_pins() == ["ครูเอ"])

# ลบชุดสุดท้ายจริง -> has_pin() กลับเป็น False (ชุดถัดไปที่เพิ่มจะไม่ต้องยืนยันของเดิมอีก)
reset()
pin_prompt_queue.append("2468")
confirm_queue.append(True)
app._on_remove_pin("ครูเอ")
t("removing the last remaining pin clears has_pin() back to False", run_lock.has_pin() is False)

app.destroy()
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
