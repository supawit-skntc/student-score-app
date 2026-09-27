"""ทดสอบว่าปุ่ม "รันจริง" ถาม PIN ถูกจังหวะหรือไม่ (ตั้ง PIN ไว้/ไม่ได้ตั้ง, ทดสอบ/รันจริง, มือ/อัตโนมัติ)
โดยไม่เปิดหน้าต่างโมดัลจริง (stub _prompt_pin_dialog) และไม่สั่งรันบอทจริง (stub subprocess.Popen + threading.Thread)
รัน: python rpa-bot/tests/test_bot_run_pin_gate.py
"""
import os
import subprocess
import sys
import threading

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import customtkinter as ctk  # noqa: E402
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


# --- stubs: เครดิตครบเสมอ / ไม่เปิดกล่องข้อความจริง / ไม่รันโปรเซสจริง ---
bot_gui.keyring.get_password = lambda service, key: "x"
messagebox.showwarning = lambda *a, **k: None
messagebox.showinfo = lambda *a, **k: None
errors = []
messagebox.showerror = lambda title, text: errors.append((title, text))


class SyncThread:
    """แทน threading.Thread จริง — รัน target ทันทีในเธรดเดียวกัน (deterministic ทดสอบง่าย)"""

    def __init__(self, target=None, daemon=None):
        self._target = target

    def start(self):
        if self._target:
            self._target()


class FakePopen:
    calls = []

    def __init__(self, args, **kw):
        FakePopen.calls.append(args)
        self.stdout = []

    def wait(self):
        return 0


bot_gui.threading.Thread = SyncThread
bot_gui.subprocess.Popen = FakePopen
bot_gui.is_frozen = lambda: False

app = bot_gui.BotControlPanel()
app.update()

prompt_calls = []
prompt_queue = []


def fake_prompt(title, subtitle, confirm=False):
    prompt_calls.append((title, subtitle, confirm))
    return prompt_queue.pop(0) if prompt_queue else None


app._prompt_pin_dialog = fake_prompt


def reset():
    # ⚠️ ห้ามล้าง prompt_queue ที่นี่ — กรณีทดสอบเติมค่าไว้ "ก่อน" เรียก run() เสมอ (ดูตัวอย่างด้านล่าง)
    # ล้างตรงนี้จะทำให้ค่าที่เพิ่งเติมหายไปก่อนที่ _run_bot จะทันเรียก _prompt_pin_dialog ด้วยซ้ำ
    FakePopen.calls.clear()
    prompt_calls.clear()
    errors.clear()
    app.process = None
    app.is_running = False


def run(dry_run, auto=False):
    reset()
    app._run_bot(dry_run=dry_run, auto=auto)


# ---------------------------------------------------------------- A) ยังไม่ได้ตั้ง PIN เลย — ไม่ถามเลยไม่ว่ากรณีไหน
run_lock.has_pin = lambda: False
run(dry_run=True, auto=False)
t("no pin set: dry-run never prompts", len(prompt_calls) == 0)
t("no pin set: dry-run still runs (Popen called)", len(FakePopen.calls) == 1)

run(dry_run=False, auto=False)
t("no pin set: manual real-run never prompts", len(prompt_calls) == 0)
t("no pin set: manual real-run still runs", len(FakePopen.calls) == 1)

run(dry_run=False, auto=True)
t("no pin set: scheduled real-run never prompts", len(prompt_calls) == 0)
t("no pin set: scheduled real-run still runs", len(FakePopen.calls) == 1)

# ---------------------------------------------------------------- B) ตั้ง PIN ไว้แล้ว
run_lock.has_pin = lambda: True

run(dry_run=True, auto=False)
t("pin set: dry-run (test) never prompts for PIN", len(prompt_calls) == 0)
t("pin set: dry-run still runs without PIN", len(FakePopen.calls) == 1)

run(dry_run=False, auto=True)
t("pin set: scheduled/auto real-run never prompts for PIN", len(prompt_calls) == 0)
t("pin set: scheduled real-run proceeds without asking", len(FakePopen.calls) == 1)

# manual real-run + user cancels the PIN dialog -> aborted, nothing runs
prompt_queue.append(None)
run_lock.verify_pin = lambda pin: True  # ไม่ควรถูกเรียกเลยเพราะ dialog คืน None (ยกเลิก) ก่อน
run(dry_run=False, auto=False)
t("pin set: manual real-run prompts exactly once", len(prompt_calls) == 1)
t("pin set: cancelling the PIN dialog aborts the run", len(FakePopen.calls) == 0)
t("pin set: cancelling does not flip is_running", app.is_running is False)

# manual real-run + wrong PIN -> rejected, nothing runs, error shown
prompt_queue.append("0000")
run_lock.verify_pin = lambda pin: False
run(dry_run=False, auto=False)
t("wrong pin: run is aborted", len(FakePopen.calls) == 0)
t("wrong pin: error dialog shown", len(errors) == 1 and "ไม่ถูกต้อง" in errors[0][0])

# manual real-run + correct PIN -> proceeds exactly once
verified_with = []
prompt_queue.append("2468")
run_lock.verify_pin = lambda pin: verified_with.append(pin) or pin == "2468"
run(dry_run=False, auto=False)
t("correct pin: run proceeds", len(FakePopen.calls) == 1)
t("correct pin: verify_pin received exactly what the dialog returned", verified_with == ["2468"])
t("correct pin: no error shown", len(errors) == 0)

app.destroy()
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
