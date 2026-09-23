"""
build_exe.py — สร้างโปรแกรม RMS-Bot (ไฟล์ .exe พร้อมใช้) สำหรับแจกไปเครื่องอื่น

รันจากโฟลเดอร์ rpa-bot บนเครื่องที่ติดตั้ง Python + requirements.txt แล้ว:
    python build_exe.py            สร้างโปรแกรม + ทดสอบ + บีบอัดเป็น .zip
    python build_exe.py --no-zip   ไม่บีบอัด
    python build_exe.py --no-test  ข้ามการทดสอบอัตโนมัติ (ไม่แนะนำ)

ผลลัพธ์: dist/RMS-Bot/  (โฟลเดอร์ที่ก็อปไปเครื่องไหนก็ใช้ได้เลย ไม่ต้องลง Python)
        dist/RMS-Bot.zip

ต้องต่ออินเทอร์เน็ตตอน build (ดาวน์โหลด PyInstaller และเบราว์เซอร์ Chromium ~150MB)
ตอนใช้งานเครื่องปลายทางไม่ต้องติดตั้งอะไรเพิ่ม
"""

import os
import re
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "build_assets")
DIST = os.path.join(HERE, "dist")
OUT = os.path.join(DIST, "RMS-Bot")
LOGO = os.path.join(HERE, "..", "public", "logo-skntc.png")

README_TEXT = """\
RMS-Bot — โปรแกรมบอทบันทึกข้อมูลเข้า RMS
=========================================

เริ่มใช้งาน (เครื่องใหม่)
  1. ก็อปโฟลเดอร์ RMS-Bot ทั้งโฟลเดอร์ไปไว้ที่ไหนก็ได้ (ห้ามใส่ใน Program Files)
  2. ดับเบิลคลิก RMS-Bot.exe
  3. กรอกบัญชีในหัวข้อ "1. ตั้งค่าบัญชี" แล้วกด "บันทึกการตั้งค่า" (ทำครั้งเดียวต่อเครื่อง
     รหัสผ่านเก็บใน Windows Credential Manager ไม่ได้ติดไปกับโฟลเดอร์)
  4. กด "ทดสอบ" (dry run) ก่อนเสมอ แล้วค่อยกด "รันจริง"

ถ้า Windows ขึ้น "Windows protected your PC": กด More info > Run anyway
(โปรแกรมนี้ยังไม่ได้ลงลายเซ็นดิจิทัล จึงถูกเตือนเป็นปกติ)

ตรวจว่าโปรแกรมพร้อมใช้ (ไม่ยุ่งกับ RMS/เว็บแอป):
  เปิด PowerShell ในโฟลเดอร์นี้แล้วรัน:  .\\rms-bot-runner.exe --self-test

รันอัตโนมัติ (Windows Task Scheduler)
  Program:   <โฟลเดอร์นี้>\\rms-bot-runner.exe
  Start in:  <โฟลเดอร์นี้>
  (เพิ่ม --dry-run ต่อท้ายถ้าต้องการทดสอบ) log อยู่ที่ logs\\bot.log

เมื่อ deploy Apps Script ใหม่แล้วได้ URL ใหม่
  เปิด config.json ด้วย Notepad แก้ค่า gas_api_url เป็น URL ใหม่ แล้วบันทึก
  (ไม่ต้อง build โปรแกรมใหม่) — URL ต้องตรงกับใน src/services/api.js ของเว็บเสมอ

ไฟล์ในโฟลเดอร์นี้
  RMS-Bot.exe          หน้าต่างควบคุม
  rms-bot-runner.exe   ตัวรันบอท (ปุ่มในหน้าต่างและ Task Scheduler เรียกตัวนี้)
  config.json          ตั้งค่า URL เว็บแอป
  browsers\\            เบราว์เซอร์ Chromium ที่ฝังมา (ห้ามลบ)
  logs\\                บันทึกการทำงาน (สร้างเองเมื่อรัน)
"""


def run(cmd, **kw):
    print("\n$ " + " ".join(cmd))
    subprocess.check_call(cmd, cwd=HERE, **kw)


def read_default_url() -> str:
    text = open(os.path.join(HERE, "sheets_queue.py"), encoding="utf-8").read()
    m = re.search(r'DEFAULT_GAS_API_URL\s*=\s*"([^"]+)"', text)
    if not m:
        sys.exit("หา DEFAULT_GAS_API_URL ใน sheets_queue.py ไม่เจอ")
    return m.group(1)


def make_icon() -> None:
    from PIL import Image

    os.makedirs(ASSETS, exist_ok=True)
    img = Image.open(LOGO).convert("RGBA")
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
    canvas.save(os.path.join(ASSETS, "app.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("สร้างไอคอนแล้ว")


def main() -> None:
    no_zip = "--no-zip" in sys.argv
    no_test = "--no-test" in sys.argv

    run([sys.executable, "-m", "pip", "install", "--quiet", "pyinstaller>=6.0"])

    make_icon()

    browsers = os.path.join(ASSETS, "browsers")
    env = dict(os.environ, PLAYWRIGHT_BROWSERS_PATH=browsers)
    run([sys.executable, "-m", "playwright", "install", "chromium"], env=env)

    run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
         "--workpath", os.path.join(HERE, "build_work"), "--distpath", DIST, "rms_bot.spec"])

    # ใส่ของที่ต้องอยู่ "ข้างๆ" โปรแกรมให้ครบ
    dest_browsers = os.path.join(OUT, "browsers")
    if os.path.isdir(dest_browsers):
        shutil.rmtree(dest_browsers)
    shutil.copytree(browsers, dest_browsers)

    import json
    with open(os.path.join(OUT, "config.json"), "w", encoding="utf-8") as f:
        json.dump({"gas_api_url": read_default_url()}, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(os.path.join(OUT, "อ่านก่อนใช้งาน.txt"), "w", encoding="utf-8-sig") as f:
        f.write(README_TEXT)

    if not no_test:
        print("\n=== ทดสอบอัตโนมัติ (--self-test) ===")
        rc = subprocess.call([os.path.join(OUT, "rms-bot-runner.exe"), "--self-test"], cwd=OUT)
        if rc != 0:
            sys.exit("การทดสอบอัตโนมัติไม่ผ่าน — ดูรายการด้านบน (ข้อ 'ตั้งค่าบัญชี' ไม่ผ่านบนเครื่องใหม่เป็นเรื่องปกติ)")

    if not no_zip:
        zip_path = os.path.join(DIST, "RMS-Bot.zip")
        print(f"\nกำลังบีบอัด {zip_path} ...")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for root, _dirs, files in os.walk(OUT):
                for name in files:
                    full = os.path.join(root, name)
                    z.write(full, os.path.relpath(full, DIST))

    size = sum(os.path.getsize(os.path.join(r, n)) for r, _d, fs in os.walk(OUT) for n in fs)
    print(f"\nเสร็จแล้ว: {OUT}  ({size / 1024 / 1024:.0f} MB)")


if __name__ == "__main__":
    main()
