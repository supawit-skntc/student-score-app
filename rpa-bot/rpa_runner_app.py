"""
rpa_runner_app.py — ตัวเข้าโปรแกรม "rms-bot-runner.exe" (แบบ console ไม่มีหน้าต่าง)

ใช้ 2 ทาง:
  1. ปุ่ม "ทดสอบ/รันจริง" ในหน้าต่างควบคุม (RMS-Bot.exe) เรียกตัวนี้เป็นโปรเซสลูก
  2. Windows Task Scheduler ชี้มาที่ไฟล์นี้ตรงๆ เพื่อรันอัตโนมัติ เช่น ทุก 15 นาที:
       rms-bot-runner.exe            (รันจริง)
       rms-bot-runner.exe --dry-run  (ทดสอบ ไม่บันทึกจริง)
       rms-bot-runner.exe --self-test  (ตรวจว่าโปรแกรมพร้อมใช้ ไม่ยุ่งกับ RMS/เว็บแอป)

ตัวแปรสภาพแวดล้อม PLAYWRIGHT_BROWSERS_PATH ต้องตั้ง "ก่อน" import playwright ทุกกรณี
เพื่อให้ใช้ Chromium ที่ฝังมาในโฟลเดอร์ browsers ข้างโปรแกรม ไม่ไปหาในเครื่องที่อาจ
ไม่เคยติดตั้ง
"""

import logging
import logging.handlers
import os
import sys

from app_paths import app_dir, is_frozen

_browsers = os.path.join(app_dir(), "browsers")
if os.path.isdir(_browsers):
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = _browsers


def _utf8_console() -> None:
    # console ของ Windows มักเป็น cp874/cp1252 ภาษาไทยจะเพี้ยนถ้าไม่บังคับ UTF-8
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def self_test() -> int:
    """ตรวจว่าโปรแกรมที่ห่อมาพร้อมใช้จริง โดยไม่ยุ่งกับ RMS หรือเว็บแอปเลย (ไม่ login
    ไม่อ่านคิว ไม่เขียนอะไร) — ใช้ยืนยันหลัง build และหลังย้ายไปเครื่องใหม่"""
    ok = True

    def check(label: str, passed: bool, detail: str = "") -> None:
        nonlocal ok
        ok = ok and passed
        print(f"[{'ผ่าน' if passed else 'ไม่ผ่าน'}] {label}" + (f" — {detail}" if detail else ""))

    print(f"โฟลเดอร์โปรแกรม: {app_dir()}  (ห่อเป็น .exe: {is_frozen()})")

    try:
        import keyring
        backend = keyring.get_keyring()
        name = f"{type(backend).__module__}.{type(backend).__name__}"
        check("ที่เก็บรหัสผ่าน (Windows Credential Manager)", "Windows" in name or "WinVault" in name, name)
        from sheets_queue import SERVICE
        has_app = bool(keyring.get_password(SERVICE, "app_username"))
        has_rms = bool(keyring.get_password(SERVICE, "rms_username"))
        # แสดงแค่ "มี/ไม่มี" ไม่แสดงค่าใดๆ ของบัญชี
        check("ตั้งค่าบัญชีเว็บแอปไว้แล้ว", has_app, "มี" if has_app else "ยังไม่ตั้งค่า (ตั้งในหน้าต่างควบคุม)")
        check("ตั้งค่าบัญชี RMS ไว้แล้ว", has_rms, "มี" if has_rms else "ยังไม่ตั้งค่า (ตั้งในหน้าต่างควบคุม)")
    except Exception as e:
        check("ที่เก็บรหัสผ่าน (keyring)", False, repr(e))

    try:
        from sheets_queue import GAS_API_URL
        good = GAS_API_URL.startswith("https://script.google.com/macros/s/")
        check("URL เว็บแอป (Apps Script)", good, "..." + GAS_API_URL[-24:])
    except Exception as e:
        check("URL เว็บแอป", False, repr(e))

    try:
        import requests  # noqa: F401
        import customtkinter  # noqa: F401
        check("ไลบรารีที่ต้องใช้ (requests, customtkinter)", True)
    except Exception as e:
        check("ไลบรารีที่ต้องใช้", False, repr(e))

    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto("about:blank")
            version = browser.version
            browser.close()
        check("เบราว์เซอร์ Chromium สำหรับบอท", True, f"เวอร์ชัน {version}")
    except Exception as e:
        check("เบราว์เซอร์ Chromium สำหรับบอท", False, str(e).splitlines()[0][:160])

    print("\nสรุป: " + ("พร้อมใช้งาน" if ok else "มีบางอย่างไม่ผ่าน — ดูรายการด้านบน"))
    return 0 if ok else 1


def _add_file_log() -> None:
    # เก็บ log ลงไฟล์ข้างโปรแกรมด้วย — ตอน Task Scheduler รันเงียบๆ ไม่มีจอให้ดู
    # ย้อนดูได้ว่ารอบไหนเกิดอะไรขึ้น (หมุนเวียนไฟล์ ไม่โตไม่จำกัด)
    try:
        log_dir = os.path.join(app_dir(), "logs")
        os.makedirs(log_dir, exist_ok=True)
        handler = logging.handlers.RotatingFileHandler(
            os.path.join(log_dir, "bot.log"), maxBytes=1_000_000, backupCount=5, encoding="utf-8",
        )
        handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
        logging.getLogger().addHandler(handler)
    except OSError:
        pass


if __name__ == "__main__":
    _utf8_console()
    if "--self-test" in sys.argv:
        sys.exit(self_test())

    import main  # noqa: E402  (ต้อง import หลังตั้ง PLAYWRIGHT_BROWSERS_PATH ด้านบน)

    _add_file_log()
    main.cli()
