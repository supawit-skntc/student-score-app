"""ทดสอบว่า _load_gas_url() ปฏิเสธ URL ที่ไม่ใช่ Apps Script จริงจากทั้ง config.json และตัวแปรสภาพแวดล้อม —
ช่องโหว่ที่พบระหว่างตรวจสอบระบบ 28/9/69: เดิมรับ gas_api_url จาก config.json แบบไม่ตรวจสอบเลย ใครก็ตามที่
แก้ไฟล์ข้อความธรรมดานี้ในโฟลเดอร์โปรแกรมได้ (เดียวกับภัยคุกคามที่ระบบ PIN กันไว้) ชี้ให้บอทส่งรหัสผ่าน EDMS
ไปเซิร์ฟเวอร์ปลอมได้ทันทีโดยไม่ต้องรู้ PIN เลย
รัน: python rpa-bot/tests/test_gas_url_validation.py
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

import sheets_queue  # noqa: E402

ok = fail = 0


def t(name, cond, extra=""):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
    print(("ok   " if cond else "FAIL ") + name + ((f"  {extra}") if extra else ""))


tmpdir = tempfile.mkdtemp(prefix="rms_bot_test_")
sheets_queue.app_dir = lambda: tmpdir
config_path = os.path.join(tmpdir, "config.json")


def write_config(url):
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump({"gas_api_url": url}, f)


def clear_env():
    os.environ.pop("RMS_BOT_GAS_URL", "")
    if "RMS_BOT_GAS_URL" in os.environ:
        del os.environ["RMS_BOT_GAS_URL"]


# ---------------------------------------------------------------- config.json ---------------------------------------------------------------
clear_env()
if os.path.exists(config_path):
    os.remove(config_path)
t("no config.json at all -> falls back to the compiled-in default", sheets_queue._load_gas_url() == sheets_queue.DEFAULT_GAS_API_URL)

clear_env()
write_config("https://script.google.com/macros/s/AKfycby-legit-deployment-id/exec")
t("a valid Apps Script URL in config.json is accepted", sheets_queue._load_gas_url() == "https://script.google.com/macros/s/AKfycby-legit-deployment-id/exec")

clear_env()
write_config("https://evil-attacker.example.com/steal-credentials")
t("a config.json pointing at a non-Apps-Script host is REJECTED, falls back to default", sheets_queue._load_gas_url() == sheets_queue.DEFAULT_GAS_API_URL)

clear_env()
write_config("http://script.google.com/macros/s/AKfycby-http-not-https/exec")
t("http (not https) is rejected even with the right host", sheets_queue._load_gas_url() == sheets_queue.DEFAULT_GAS_API_URL)

clear_env()
write_config("")
t("an empty gas_api_url in config.json falls back to the default", sheets_queue._load_gas_url() == sheets_queue.DEFAULT_GAS_API_URL)

# ---------------------------------------------------------------- RMS_BOT_GAS_URL env var (higher priority than config.json) -----------------
if os.path.exists(config_path):
    os.remove(config_path)

os.environ["RMS_BOT_GAS_URL"] = "https://script.google.com/macros/s/AKfycby-env-override/exec"
t("a valid Apps Script URL in the env var is accepted", sheets_queue._load_gas_url() == "https://script.google.com/macros/s/AKfycby-env-override/exec")

os.environ["RMS_BOT_GAS_URL"] = "https://evil-attacker.example.com/steal-credentials"
t("an env var pointing at a non-Apps-Script host is REJECTED, falls back to default", sheets_queue._load_gas_url() == sheets_queue.DEFAULT_GAS_API_URL)

clear_env()
write_config("https://script.google.com/macros/s/AKfycby-from-config/exec")
os.environ["RMS_BOT_GAS_URL"] = "https://script.google.com/macros/s/AKfycby-from-env/exec"
t("a valid env var takes priority over a valid config.json", sheets_queue._load_gas_url() == "https://script.google.com/macros/s/AKfycby-from-env/exec")

clear_env()
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
