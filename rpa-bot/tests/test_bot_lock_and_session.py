"""ทดสอบส่วนล็อกกันรันซ้อนและการล็อกอินใหม่เมื่อเซสชันหมดอายุของบอท — รัน: python rpa-bot/tests/test_bot_lock_and_session.py (Windows)"""
import os, sys, time, tempfile, subprocess, threading, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
ok = fail = 0
def t(name, cond, extra=""):
    global ok, fail
    if cond: ok += 1
    else: fail += 1
    print(("ok   " if cond else "FAIL ") + name + (("  " + str(extra)) if extra else ""))

import main
tmp = tempfile.mkdtemp()
main.LOCK_FILE_PATH = os.path.join(tmp, ".bot.lock")

# 1) ปกติ
t("lock: first acquire ok", main.acquire_lock() is True)
t("lock: second acquire refused while owner (this python) is alive", main.acquire_lock() is False)
main.release_lock()
t("lock: released", not os.path.exists(main.LOCK_FILE_PATH))

# 2) เจ้าของตายแล้ว
open(main.LOCK_FILE_PATH, "w").write("99999999")
t("lock: dead PID -> stale -> taken over", main.acquire_lock() is True)
main.release_lock()

# 3) PID ถูกโปรแกรมอื่นยึด (เช่น explorer.exe) — เดิมจะดูเหมือนบอทยังรันอยู่ตลอดกาล
out = subprocess.check_output(["tasklist", "/FI", "IMAGENAME eq explorer.exe", "/FO", "CSV", "/NH"], text=True)
explorer_pid = None
for line in out.splitlines():
    cells = [c.strip('"') for c in line.split('","')]
    if len(cells) > 1 and cells[0].lower().lstrip('"') == "explorer.exe": explorer_pid = int(cells[1]); break
if explorer_pid:
    open(main.LOCK_FILE_PATH, "w").write(str(explorer_pid))
    t("lock: PID reused by unrelated program (explorer.exe) -> stale", main.acquire_lock() is True, f"pid={explorer_pid}")
    main.release_lock()
else:
    print("skip: explorer.exe not found")

# 4) เก่าเกิน 6 ชม. แม้ PID ยังเป็น python
open(main.LOCK_FILE_PATH, "w").write(str(os.getpid()))
old = time.time() - 7 * 3600
os.utime(main.LOCK_FILE_PATH, (old, old))
t("lock: older than 6h -> stale even if pid alive", main.acquire_lock() is True)
main.release_lock()

# 5) ไฟล์ล็อกเสีย
open(main.LOCK_FILE_PATH, "w").write("not-a-number")
t("lock: corrupt file -> stale", main.acquire_lock() is True)
main.release_lock()

# 6) เริ่มพร้อมกัน 8 เธรด — ต้องได้ล็อกแค่ตัวเดียว
results = []
def worker(): results.append(main.acquire_lock())
ths = [threading.Thread(target=worker) for _ in range(8)]
[x.start() for x in ths]; [x.join() for x in ths]
t("lock: 8 simultaneous starters -> exactly one wins", results.count(True) == 1, results)
main.release_lock()

# 7) sheets_queue: ล็อกอินใหม่เองเมื่อเซสชันหมดอายุ
import sheets_queue as sq
sq.APP_USERNAME, sq.APP_PASSWORD = "u", "p"
calls = []
class R:
    def __init__(self, obj): self.obj = obj; self.status_code = 200; self.text = json.dumps(obj)
    def raise_for_status(self): pass
    def json(self): return self.obj
state = {"logins": 0}
def fake_post(url, data=None, headers=None, timeout=None):
    body = json.loads(data); calls.append((body["action"], body.get("token")))
    if body["action"] == "login":
        state["logins"] += 1
        return R({"status": "success", "token": f"tok{state['logins']}"})
    if body.get("token") != "tok1":
        return R({"status": "error", "message": "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"})
    return R({"status": "success", "data": [{"id": "r1"}]})
sq._http.post = fake_post
sq._token = "tok-old"
res = sq.get_pending_records()
t("expired session: re-login once and retry succeeds", res == [{"id": "r1"}] and [c[0] for c in calls] == ["getSyncQueue", "login", "getSyncQueue"], calls)
# ต้องไม่วนไม่รู้จบ ถ้าเซิร์ฟเวอร์ปฏิเสธซ้ำ
calls.clear(); state["logins"] = 0
def always_expired(url, data=None, headers=None, timeout=None):
    body = json.loads(data); calls.append(body["action"])
    if body["action"] == "login": return R({"status": "success", "token": "t"})
    return R({"status": "error", "message": "เซสชันหมดอายุ"})
sq._http.post = always_expired; sq._token = "x"
try:
    sq.get_pending_records(); raised = False
except RuntimeError as e:
    raised = True
t("expired session persists: fails after ONE retry (no infinite loop)", raised and calls.count("login") == 1, calls)
t("http keep-alive session object in use", isinstance(sq._http, sq.requests.Session))
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
