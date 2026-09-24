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

README_TEXT = """RMS-Bot — วิธีใช้ (อ่านแค่หน้านี้พอ)
====================================

เริ่มใช้งานครั้งแรก มี 4 ขั้นตอน (ข้อ 5 ไม่บังคับ)
  1. ดับเบิลคลิก  RMS-Bot.exe
       - ครั้งแรกบนเครื่องนี้อาจรอ 5-30 วินาที (Windows ตรวจไฟล์ใหม่) รอจนหน้าต่างขึ้น อย่ากดซ้ำ
       - ถ้าขึ้น "Windows protected your PC" ให้กด "More info" แล้วกด "Run anyway"
  2. ช่องซ้ายมือ "ขั้นตอนที่ 1 ตั้งค่าบัญชี" กรอกชื่อผู้ใช้/รหัสผ่านให้ครบ 4 ช่อง
       แล้วกดปุ่มสีแดง "บันทึกการตั้งค่า" (อยู่ล่างสุดของช่องซ้าย)
       ทำครั้งเดียวต่อเครื่อง
  3. ช่องขวามือ กดปุ่ม "ทดสอบ" ก่อน ดูข้อความในกล่องดำว่าไม่มีข้อผิดพลาด
  4. เมื่อทดสอบผ่านแล้ว กดปุ่ม "รันจริง"
  5. (ไม่บังคับ) อยากให้รันเองทุกวัน: ที่ช่องขวา "รันจริงอัตโนมัติตามเวลา" พิมพ์เวลา เช่น 11:00, 16:00
     แล้วเปิดสวิตช์ — โปรแกรมจะรันจริงให้เองตามเวลานั้น
     (ต้องเปิดหน้าต่างโปรแกรมค้างไว้ และไม่ให้เครื่องหลับ/ปิดเครื่อง)

ย้ายไปเครื่องอื่น: ก็อปทั้งโฟลเดอร์ RMS-Bot ไปวางที่ไหนก็ได้ แล้วเริ่มที่ข้อ 1 ใหม่
(ห้ามวางใน Program Files และห้ามลบโฟลเดอร์ย่อยข้างใน)

มีปัญหา? ดูไฟล์ "สำหรับผู้ดูแลระบบ.txt" หรือติดต่อผู้ดูแลระบบ
"""

ADMIN_TEXT = """RMS-Bot — สำหรับผู้ดูแลระบบ / ผู้ที่ดูแลเครื่อง
==============================================

เปิดโปรแกรมครั้งแรกช้า
  เกิดจาก Windows Defender/โปรแกรมป้องกันไวรัสสแกนไฟล์ใหม่ (โฟลเดอร์นี้มีหลายพันไฟล์)
  ครั้งต่อๆ ไปจะเร็วขึ้นเอง ถ้าจะให้เร็วตั้งแต่ครั้งแรก: Windows Security > Virus & threat
  protection > Manage settings > Exclusions > เพิ่มโฟลเดอร์ RMS-Bot นี้
  (ทำได้เฉพาะเครื่องที่ผู้ดูแลอนุญาต) ควรวางโฟลเดอร์ไว้ในไดรฟ์ SSD

หน้าต่างสูงเกินจอ
  โปรแกรมปรับขนาดตามจอเองแล้ว ถ้าช่องกรอกยาวเกินให้เลื่อนเมาส์ในช่องซ้าย
  ปุ่ม "บันทึกการตั้งค่า" ปักอยู่ล่างสุดเสมอ

รันอัตโนมัติตามเวลา (ในตัวโปรแกรม — ไม่ต้องตั้งอะไรใน Windows)
  ในหน้าต่าง RMS-Bot ช่อง "รันจริงอัตโนมัติตามเวลา": พิมพ์เวลา เช่น 11:00, 16:00 แล้วเปิดสวิตช์
  - รันจริงทุกวันตามเวลานั้น (บันทึกลง RMS จริง) ข้อความความคืบหน้าขึ้นในกล่องดำเหมือนกดเอง
  - ต้องเปิดหน้าต่างโปรแกรมค้างไว้ และเครื่องต้องไม่หลับ/ไม่ปิด (ตั้ง Power & sleep เป็น Never)
  - ถ้าเครื่องหลับจนเลยเวลาไปเกิน 10 นาที จะข้ามรอบนั้น ไม่รันย้อนหลัง
  - จะแก้เวลาได้ต้องปิดสวิตช์ก่อน / ตารางเวลาเก็บต่อเครื่อง (%APPDATA%\\RMS-Bot\\schedule.json)
    ไม่ติดไปกับโฟลเดอร์โปรแกรม จึงไม่ต้องกลัวก็อปไปเครื่องอื่นแล้วรันชนกัน
  - อย่าเปิดสวิตช์นี้พร้อมกันหลายเครื่อง (บอทหลายตัวจะแย่งประมวลผลรายการเดียวกัน)

รันอัตโนมัติแบบไม่ต้องเปิดหน้าต่าง (ทางเลือกสำรอง — Windows Task Scheduler)
  Program:   <โฟลเดอร์นี้>\\rms-bot-runner.exe
  Start in:  <โฟลเดอร์นี้>
  (เพิ่ม --dry-run ต่อท้ายถ้าต้องการทดสอบ)  log อยู่ที่ logs\\bot.log
  ต้องตั้งค่าบัญชีในหน้าต่าง RMS-Bot ด้วย Windows user เดียวกับที่ Task Scheduler ใช้รัน

เมื่อ deploy Apps Script ใหม่แล้วได้ URL ใหม่
  เปิด config.json ด้วย Notepad แก้ค่า gas_api_url เป็น URL ใหม่ แล้วบันทึก
  (ไม่ต้อง build โปรแกรมใหม่) — URL ต้องตรงกับใน src/services/api.js ของเว็บเสมอ

ไฟล์ในโฟลเดอร์นี้
  RMS-Bot.exe          หน้าต่างควบคุม
  rms-bot-runner.exe   ตัวรันบอท (ปุ่มในหน้าต่างและ Task Scheduler เรียกตัวนี้)
  config.json          ตั้งค่า URL เว็บแอป
  browsers\\          เบราว์เซอร์ Chromium ที่ฝังมา (ห้ามลบ)
  logs\\              บันทึกการทำงาน (สร้างเองเมื่อรัน)
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


def make_splash() -> None:
    from PIL import Image, ImageDraw, ImageFont

    os.makedirs(ASSETS, exist_ok=True)
    fonts = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts")
    font_path = next(
        (os.path.join(fonts, f) for f in ("leelawad.ttf", "LeelawUI.ttf", "tahoma.ttf")
         if os.path.exists(os.path.join(fonts, f))), None)
    bold_path = next(
        (os.path.join(fonts, f) for f in ("leelawdb.ttf", "tahomabd.ttf")
         if os.path.exists(os.path.join(fonts, f))), font_path)
    if not font_path:
        sys.exit("ไม่พบฟอนต์ภาษาไทยของ Windows สำหรับสร้างหน้าจอ splash")

    w, h = 520, 200
    img = Image.new("RGB", (w, h), "#ffffff")
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], outline="#e0d8d4")
    d.rectangle([0, 0, w, 8], fill="#7c2438")
    logo = Image.open(LOGO).convert("RGBA")
    logo.thumbnail((84, 84))
    img.paste(logo, (34, 58), logo)
    d.text((140, 56), "RMS-Bot", font=ImageFont.truetype(bold_path, 34), fill="#1c1917")
    d.text((140, 106), "กำลังเปิดโปรแกรม กรุณารอสักครู่...", font=ImageFont.truetype(font_path, 20), fill="#57534e")
    d.text((140, 138), "ครั้งแรกบนเครื่องนี้อาจใช้เวลานานกว่าปกติ", font=ImageFont.truetype(font_path, 16), fill="#a8a29e")
    img.save(os.path.join(ASSETS, "splash.png"))
    print("สร้างหน้าจอ splash แล้ว")


def main() -> None:
    no_zip = "--no-zip" in sys.argv
    no_test = "--no-test" in sys.argv

    run([sys.executable, "-m", "pip", "install", "--quiet", "pyinstaller>=6.0"])

    make_icon()
    make_splash()

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
    with open(os.path.join(OUT, "สำหรับผู้ดูแลระบบ.txt"), "w", encoding="utf-8-sig") as f:
        f.write(ADMIN_TEXT)

    # ตรวจว่าไฟล์แกนของ Python ที่ห่อไม่เสียหาย — ถ้าเสีย โปรแกรมจะขึ้น
    # "Failed to start embedded python interpreter" ตั้งแต่เปิด (เคยเจอตอน build ลงโฟลเดอร์ที่ถูกล็อก)
    with zipfile.ZipFile(os.path.join(OUT, "_internal", "base_library.zip")) as zf:
        bad = zf.testzip()
    if bad:
        sys.exit(f"base_library.zip เสียหาย ({bad}) — ลบโฟลเดอร์ dist แล้ว build ใหม่")

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
