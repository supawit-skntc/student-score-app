"""ทดสอบว่าเปลี่ยน/ปิดใช้งาน PIN ต้องกรอก PIN เดิมให้ถูกก่อนเสมอ (ไม่งั้นใครก็ตามที่มาเจอโปรแกรมเปิดค้าง
อยู่จะปลดล็อกเองได้โดยไม่ต้องรู้ PIN เลย ทำให้ทั้งฟีเจอร์ไม่มีความหมาย — ดู _confirm_current_pin ใน bot_gui.py)
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

prompt_calls = []
prompt_queue = []


def fake_prompt(title, subtitle, confirm=False):
    prompt_calls.append((title, confirm))
    return prompt_queue.pop(0) if prompt_queue else None


app._prompt_pin_dialog = fake_prompt


def reset():
    prompt_calls.clear()
    prompt_queue.clear()
    info_msgs.clear()
    warn_msgs.clear()
    error_msgs.clear()
    confirm_queue.clear()


# ---------------------------------------------------------------- A) ยังไม่เคยตั้ง PIN — ตั้งครั้งแรกไม่ต้องยืนยันของเดิม
reset()
prompt_queue.append("2468")  # ตั้งใหม่ (confirm=True เรียกครั้งเดียว ไม่มีขั้นยืนยันของเดิมมาก่อน)
app._on_set_pin()
t("first-time set: only ONE dialog shown (no 'confirm current PIN' step)", len(prompt_calls) == 1)
t("first-time set: the one dialog IS the confirm=True new-pin dialog", prompt_calls[0][1] is True)
t("first-time set: pin actually saved", run_lock.has_pin() is True and run_lock.verify_pin("2468") is True)

# ---------------------------------------------------------------- B) เปลี่ยน PIN โดยไม่รู้ PIN เดิม -> ต้องถูกปฏิเสธ ค่าเดิมไม่เปลี่ยน
reset()
prompt_queue.append("0000")  # กรอก "PIN เดิม" ผิด
app._on_set_pin()
t("change pin with WRONG current pin: aborted (only the current-pin dialog shown)", len(prompt_calls) == 1 and prompt_calls[0][1] is False)
t("change pin with wrong current pin: error shown", len(error_msgs) == 1)
t("change pin with wrong current pin: old pin still works", run_lock.verify_pin("2468") is True)

# ยกเลิกตอนถูกถามหา PIN เดิม (กด "ยกเลิก") -> ก็ต้องไม่เปลี่ยนเช่นกัน และไม่ถูกถามหา PIN ใหม่เลย
reset()
prompt_queue.append(None)
app._on_set_pin()
t("cancelling the current-pin prompt aborts before asking for a new pin", len(prompt_calls) == 1)
t("cancelling: old pin still works", run_lock.verify_pin("2468") is True)

# ---------------------------------------------------------------- C) เปลี่ยน PIN โดยรู้ PIN เดิมถูกต้อง -> สำเร็จ
reset()
prompt_queue.append("2468")  # PIN เดิม (ถูก)
prompt_queue.append("13579")  # PIN ใหม่
app._on_set_pin()
t("change pin with correct current pin: prompted twice (current, then new)", len(prompt_calls) == 2)
t("change pin with correct current pin: first prompt is NOT confirm=True (single current-pin entry)", prompt_calls[0][1] is False)
t("change pin with correct current pin: second prompt IS confirm=True (new pin, entered twice)", prompt_calls[1][1] is True)
t("change pin with correct current pin: new pin now active", run_lock.verify_pin("13579") is True)
t("change pin with correct current pin: old pin no longer works", run_lock.verify_pin("2468") is False)

# ---------------------------------------------------------------- D) ปิดใช้งาน PIN โดยไม่รู้ PIN เดิม -> ถูกปฏิเสธ ยังเปิดอยู่
reset()
prompt_queue.append("wrong-pin")
app._on_clear_pin()
t("clear pin with wrong current pin: rejected", run_lock.has_pin() is True)
t("clear pin with wrong current pin: error shown", len(error_msgs) == 1)

# ---------------------------------------------------------------- E) ปิดใช้งาน PIN ด้วย PIN เดิมที่ถูกต้อง + ยืนยัน "ใช่"
reset()
prompt_queue.append("13579")
confirm_queue.append(True)
app._on_clear_pin()
t("clear pin with correct current pin + confirm yes: pin removed", run_lock.has_pin() is False)

# ---------------------------------------------------------------- F) ตั้ง PIN ใหม่อีกครั้งเพื่อทดสอบ "ปิดใช้งาน" แบบกด "ไม่ยืนยัน"
reset()
run_lock.set_pin("24680")
prompt_queue.append("24680")
confirm_queue.append(False)  # กด "ยกเลิก" ตอนถามยืนยันปิดใช้งาน
app._on_clear_pin()
t("clear pin: correct pin but declines the final yes/no -> PIN stays active", run_lock.has_pin() is True)

app.destroy()
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
