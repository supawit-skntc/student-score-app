"""
schedule_logic.py — ตรรกะ "รันอัตโนมัติตามเวลา" ของหน้าต่าง RMS-Bot (ไม่มีส่วนหน้าจอ ทดสอบแยกได้)

หลักการ:
- ผู้ใช้ตั้งเวลาเป็นรายการ เช่น "11:00, 16:00" — ถึงเวลาไหนโปรแกรมก็รันจริงหนึ่งรอบ
- เวลานับจากนาฬิกาเครื่อง ต้องเปิดโปรแกรมค้างไว้และเครื่องไม่หลับ
- รอบที่เลยเวลาไปไม่เกิน GRACE_MINUTES นาทีจะยังรันให้ (กันกรณีเครื่องเพิ่งตื่น/โปรแกรมช้า)
  เลยกว่านั้นถือว่าพลาดรอบนั้น ไม่รันย้อนหลัง
- จำวันที่ที่รันแต่ละเวลาไว้ในไฟล์ ปิดแล้วเปิดโปรแกรมใหม่ในรอบเดิมจะไม่รันซ้ำ
- ไฟล์ตั้งค่าเก็บต่อเครื่อง/ต่อผู้ใช้ Windows (%APPDATA%\\RMS-Bot) ไม่เก็บข้างโปรแกรม
  เพื่อไม่ให้ตอนก็อปโฟลเดอร์โปรแกรมไปเครื่องอื่น ตารางรันจริงติดไปด้วยแล้วสองเครื่องรันชนกัน
"""

import datetime
import json
import os
import re

GRACE_MINUTES = 10
DEFAULT_TIMES = ["11:00", "16:00"]

_TIME_RE = re.compile(r"^(\d{1,2})[:.](\d{2})$")


def parse_times(text):
    """แปลงข้อความ "11:00, 16.30 น." เป็นรายการเวลา ["11:00", "16:30"] (เรียงแล้ว ไม่ซ้ำ)

    ผิดรูปแบบแล้ว raise ValueError พร้อมข้อความภาษาไทยที่แสดงให้ผู้ใช้ได้เลย
    """
    parts = [p for p in re.split(r"[,\s]+", (text or "").replace("น.", " ")) if p]
    if not parts:
        raise ValueError("กรุณาใส่เวลาอย่างน้อย 1 เวลา เช่น 11:00")
    times = set()
    for part in parts:
        match = _TIME_RE.match(part)
        if not match:
            raise ValueError(f"อ่านเวลา \"{part}\" ไม่ได้ — ใช้รูปแบบ 11:00 หรือ 16:30 (คั่นหลายเวลาด้วยเครื่องหมายจุลภาค)")
        hour, minute = int(match.group(1)), int(match.group(2))
        if hour > 23 or minute > 59:
            raise ValueError(f"เวลา \"{part}\" ไม่ถูกต้อง — ชั่วโมงต้อง 0-23 และนาที 0-59")
        times.add(f"{hour:02d}:{minute:02d}")
    return sorted(times)


def _slot(day, hhmm):
    hour, minute = hhmm.split(":")
    return datetime.datetime.combine(day, datetime.time(int(hour), int(minute)))


def due_slot(now, times, last_runs, grace_minutes=GRACE_MINUTES):
    """เวลา (เช่น "11:00") ที่ถึงกำหนดรันตอนนี้และยังไม่ได้รันวันนี้ — ไม่มีคืน None"""
    today = now.date().isoformat()
    for hhmm in times:
        start = _slot(now.date(), hhmm)
        if start <= now < start + datetime.timedelta(minutes=grace_minutes) and last_runs.get(hhmm) != today:
            return hhmm
    return None


def next_run(now, times, last_runs):
    """รอบถัดไปที่จะรัน (datetime) — นับรอบวันนี้ที่ยังไม่ถึง/ยังไม่รัน แล้วต่อด้วยของพรุ่งนี้"""
    today = now.date().isoformat()
    candidates = []
    for day_offset in (0, 1):
        day = now.date() + datetime.timedelta(days=day_offset)
        for hhmm in times:
            start = _slot(day, hhmm)
            if start > now or (day_offset == 0 and last_runs.get(hhmm) != today
                               and now < start + datetime.timedelta(minutes=GRACE_MINUTES)):
                candidates.append(start)
    return min(candidates) if candidates else None


def describe_next_run(now, when):
    if when is None:
        return ""
    if when.date() == now.date():
        day = "วันนี้"
    elif when.date() == now.date() + datetime.timedelta(days=1):
        day = "พรุ่งนี้"
    else:
        day = when.strftime("%d/%m")
    return f"{day} {when.strftime('%H:%M')} น."


def default_state():
    return {"enabled": False, "times": list(DEFAULT_TIMES), "last_runs": {}}


def state_path(app_folder):
    base = os.environ.get("APPDATA")
    folder = os.path.join(base, "RMS-Bot") if base else app_folder
    return os.path.join(folder, "schedule.json")


def load_state(path):
    state = default_state()
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data.get("enabled"), bool):
            state["enabled"] = data["enabled"]
        times = data.get("times")
        if isinstance(times, list) and times:
            state["times"] = parse_times(" ".join(str(t) for t in times))
        last_runs = data.get("last_runs")
        if isinstance(last_runs, dict):
            state["last_runs"] = {str(k): str(v) for k, v in last_runs.items()}
    except (OSError, ValueError, AttributeError):
        # ไม่มีไฟล์/ไฟล์เสีย → ใช้ค่าเริ่มต้นที่ "ปิดอยู่" (ปลอดภัยที่สุด)
        pass
    return state


def save_state(path, state):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
