"""ทดสอบว่าแถบความคืบหน้าอัปเดตถูกต้องจากข้อความที่ main.py พิมพ์จริง (ไม่ใช่ข้อความที่คาดไว้ผิดๆ) —
บั๊กที่พบระหว่างตรวจสอบระบบ 28/9/69: main.py เปลี่ยนไปพิมพ์ "ประมวลผลเสร็จ" ตั้งแต่ commit 0241905 แต่
_parse_progress ยังหา "กำลังประมวลผล" (regex เก่าไม่เคย match เลยสักครั้ง แถบเลยค้างที่ 0% ตลอดการรัน)
รัน: python rpa-bot/tests/test_bot_progress_parsing.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import bot_gui  # noqa: E402

ok = fail = 0


def t(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
    print(("ok   " if cond else "FAIL ") + name + ((f"  {extra}") if extra else ""))


bot_gui.keyring.get_password = lambda service, key: "x"

app = bot_gui.BotControlPanel()
app.update()

app.total_count = 0
app.done_count = 0
app._parse_progress("2026-09-28 10:00:00 INFO พบ 5 รายการรอดำเนินการ")
t("total_count set from 'พบ N รายการรอดำเนินการ'", app.total_count == 5)
t("done_count reset to 0 when a new total is seen", app.done_count == 0)

app._parse_progress('2026-09-28 10:00:01 INFO --- ประมวลผลเสร็จ rec-1 (นักเรียน 69219000101) ---')
t("done_count increments on the real 'ประมวลผลเสร็จ' line main.py actually prints", app.done_count == 1)

app._parse_progress('2026-09-28 10:00:02 INFO --- ประมวลผลเสร็จ rec-2 (นักเรียน 69219000102) ---')
app._parse_progress('2026-09-28 10:00:03 INFO --- ประมวลผลเสร็จ rec-3 (นักเรียน 69219000103) ---')
t("done_count keeps incrementing per completed record", app.done_count == 3)

app._parse_progress("2026-09-28 10:00:04 INFO เพิ่งเปิดโปรแกรม กำลังตั้งค่าเริ่มต้น")
t("unrelated log lines are ignored, no false increment", app.done_count == 3)

app.destroy()
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
