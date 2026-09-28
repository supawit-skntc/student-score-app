"""ทดสอบว่าเปิดสวิตช์ "รันจริงอัตโนมัติตามเวลา" ต้องกรอก PIN ก่อนเช่นเดียวกับกดปุ่ม "รันจริง" ด้วยมือ (ถ้าตั้ง
PIN ไว้แล้ว) — เดิมจุดนี้แค่ถามยืนยัน "ใช่/ไม่ใช่" เฉยๆ ทำให้ใครก็ตามที่มาเจอโปรแกรมเปิดค้างอยู่เปิดสวิตช์นี้
เองแล้วตั้งเวลาให้บอทรันจริงทีหลังได้เลยโดยไม่ต้องรู้ PIN เลย (คำถามผู้ใช้ 28/9/69 — ดู _on_schedule_toggle
ใน bot_gui.py) ปิดสวิตช์ไม่ต้องยืนยันอะไร (ทำให้บอทปลอดภัยขึ้น ไม่ใช่เสี่ยงขึ้น)
รัน: python rpa-bot/tests/test_bot_schedule_pin_gate.py
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


run_lock.keyring = FakeKeyring()
bot_gui.keyring.get_password = lambda service, key: "x"  # บัญชี EDMS/RMS ครบเสมอ (ไม่เกี่ยวกับ PIN)

warn_msgs, error_msgs = [], []
messagebox.showwarning = lambda title, text: warn_msgs.append((title, text))
messagebox.showerror = lambda title, text: error_msgs.append((title, text))
confirm_queue = []
messagebox.askyesno = lambda title, text: confirm_queue.pop(0) if confirm_queue else True

app = bot_gui.BotControlPanel()
app.update()
app._save_schedule = lambda: True  # ห้ามเขียนไฟล์ schedule.json จริงของเครื่องที่รันเทสต์

pin_prompt_calls = []
pin_prompt_queue = []


def fake_pin_prompt(title, subtitle, confirm=False):
    pin_prompt_calls.append((title, confirm))
    return pin_prompt_queue.pop(0) if pin_prompt_queue else None


app._prompt_pin_dialog = fake_pin_prompt


def reset():
    pin_prompt_calls.clear()
    pin_prompt_queue.clear()
    warn_msgs.clear()
    error_msgs.clear()
    confirm_queue.clear()
    app.schedule["enabled"] = False
    app.schedule_switch.deselect()
    app.schedule_entry.configure(state="normal")
    app.schedule_times_var.set("11:00")


# ---------------------------------------------------------------- ปิดสวิตช์ไม่ต้องยืนยันอะไรเลย (ไม่ว่าจะตั้ง PIN ไว้หรือไม่)
reset()
run_lock.add_pin("ครูเอ", "2468")
app.schedule["enabled"] = True
app.schedule_switch.select()
app.schedule_switch.deselect()
app._on_schedule_toggle()
t("turning OFF never prompts for PIN even with a pin set", len(pin_prompt_calls) == 0)
t("turning OFF succeeds without confirmation", app.schedule["enabled"] is False)
run_lock.clear_all_pins()

# ---------------------------------------------------------------- A) ยังไม่ได้ตั้ง PIN เลย — เปิดสวิตช์ไม่ได้เลย (คำขอผู้ใช้ 28/9/69)
reset()
confirm_queue.append(True)
app.schedule_switch.select()
app._on_schedule_toggle()
t("no pin set: turning on never prompts for a PIN (blocked before reaching it)", len(pin_prompt_calls) == 0)
t("no pin set: turning on is blocked entirely, not just skipped past the pin check", app.schedule["enabled"] is False)
t("no pin set: switch is deselected back", bool(app.schedule_switch.get()) is False)
t("no pin set: a warning tells the user to set up a PIN first", len(warn_msgs) == 1 and "PIN" in warn_msgs[0][1])
t("no pin set: never even reaches the yes/no confirm", len(confirm_queue) == 1)

# ---------------------------------------------------------------- B) ตั้ง PIN ไว้แล้ว — ต้องถามก่อนเสมอ
run_lock.add_pin("ครูเอ", "2468")

# ยกเลิกตอนถูกถามหา PIN (กด "ยกเลิก") -> ไม่เปิดสวิตช์ ไม่ไปถึงขั้นถามยืนยัน ใช่/ไม่ใช่ เลย
reset()
pin_prompt_queue.append(None)
app.schedule_switch.select()
app._on_schedule_toggle()
t("cancelling the pin prompt aborts before the yes/no confirm", len(pin_prompt_calls) == 1 and len(confirm_queue) == 0)
t("cancelling the pin prompt: schedule stays disabled", app.schedule["enabled"] is False)
t("cancelling the pin prompt: switch is deselected back", bool(app.schedule_switch.get()) is False)

# PIN ผิด -> ถูกปฏิเสธ ไม่เปิดสวิตช์ แสดงข้อความ error
reset()
pin_prompt_queue.append("0000")
app.schedule_switch.select()
app._on_schedule_toggle()
t("wrong pin: schedule stays disabled", app.schedule["enabled"] is False)
t("wrong pin: error dialog shown", len(error_msgs) == 1 and "ไม่ถูกต้อง" in error_msgs[0][0])
t("wrong pin: switch is deselected back", bool(app.schedule_switch.get()) is False)

# PIN ถูก แต่กด "ไม่ใช่" ตอนถามยืนยันสุดท้าย -> ยังไม่เปิด
reset()
pin_prompt_queue.append("2468")
confirm_queue.append(False)
app.schedule_switch.select()
app._on_schedule_toggle()
t("correct pin but declines the final yes/no: schedule stays disabled", app.schedule["enabled"] is False)
t("correct pin but declines the final yes/no: switch is deselected back", bool(app.schedule_switch.get()) is False)

# PIN ถูก + ยืนยัน "ใช่" -> เปิดสำเร็จ และบันทึกชื่อเจ้าของ PIN ลงคอนโซล
reset()
pin_prompt_queue.append("2468")
confirm_queue.append(True)
app.schedule_switch.select()
app._on_schedule_toggle()
t("correct pin + confirm yes: schedule becomes enabled", app.schedule["enabled"] is True)
t("correct pin + confirm yes: owner's name logged to the console", 'ครูเอ' in app.log_box.get("1.0", "end"))

app.destroy()
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
