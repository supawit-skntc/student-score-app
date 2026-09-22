"""
rms_bot.py — ระบบ RPA สำหรับบันทึกข้อมูลพฤติกรรมผู้เรียนเข้าสู่ระบบ RMS จริง
(rms.skntc.ac.th) โดยอัตโนมัติ ใช้ Playwright จำลองการคลิกเหมือนมนุษย์

ป้องกันการบันทึกซ้ำด้วยการฝัง "[REF:<uuid>]" ต่อท้ายช่องรายละเอียดทุกครั้งที่บันทึก
แล้วเช็คก่อนบันทึกทุกครั้งว่ามี REF นี้อยู่ในตาราง "พฤติกรรม" ของนักเรียนคนนั้นแล้ว
หรือยัง — uuid มาจากคอลัมน์ A ของชีต Records (สร้างครั้งเดียวตอนครูบันทึกฟอร์ม)
ดังนั้นแม้บอทจะถูกรันซ้ำ (เช่น หลัง crash กลางคัน) ก็จะไม่มีวันสร้างรายการซ้ำใน RMS

ติดตั้งก่อนใช้:
    pip install -r requirements.txt
    playwright install chromium
"""

import keyring
import logging
import re
import time
from playwright.sync_api import sync_playwright, Page, TimeoutError as PlaywrightTimeout

from offense_mapping import get_offense_entry, INCOR_GROUP_ID_BEHAVIOR

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("rms_bot")

BASE_URL = "https://rms.skntc.ac.th"

# 🔐 ดึงจาก Windows Credential Manager (ตั้งค่าครั้งเดียวผ่าน setup_credentials.py)
# ห้าม hardcode รหัสผ่านในไฟล์นี้เด็ดขาด
SERVICE = "rms-rpa-bot"
RMS_BOT_USERNAME = keyring.get_password(SERVICE, "rms_username")
RMS_BOT_PASSWORD = keyring.get_password(SERVICE, "rms_password")

THAI_MONTHS = [
    "", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
]


class RecordFlaggedForReview(Exception):
    """ใช้เมื่อรายการต้องหยุดและส่งให้เจ้าหน้าที่ตรวจสอบ แทนที่จะให้บอทเดาเอง
    (ตรงกับขอบเขตระบบ 4.2.3: 'หยุดการประมวลผลและส่งรายการให้เจ้าหน้าที่ตรวจสอบ
    เมื่อพบข้อมูลผิดปกติ')"""


class AlreadySynced(Exception):
    """รายการนี้มี REF tag อยู่ใน RMS แล้ว — ไม่ต้องบันทึกซ้ำ ให้ถือว่าสำเร็จเลย"""


def ref_tag(uuid: str) -> str:
    return f"[REF:{uuid}]"


def login(page: Page, username: str, password: str) -> None:
    log.info("เข้าสู่ระบบ RMS ด้วยบัญชี %s", username)
    page.goto(f"{BASE_URL}/?p=login&p_to=")
    page.fill('input[name="username_log"]', username)
    page.fill('input[name="password_log"]', password)
    page.click('button[type="submit"]')
    try:
        # เพิ่ม timeout จาก 10 -> 20 วิ เผื่อเซิร์ฟเวอร์ตอบช้ากว่าปกติ
        # (login ครั้งแรกที่ผ่านมาใช้เวลาไปแล้ว ~11 วิ ใกล้ขีดจำกัดเดิมมาก)
        page.wait_for_url("**mod=home**", timeout=20000)
    except PlaywrightTimeout:
        # 🔍 บันทึกไว้ว่าตอน timeout จริงๆ หน้าเว็บค้างอยู่ที่ URL ไหน และมีข้อความ
        # อะไรโผล่ขึ้นมาบ้าง — ครั้งหน้าถ้าเจอปัญหานี้อีกจะได้รู้สาเหตุจริงทันที
        # แทนที่จะเดา
        stuck_url = page.url
        visible_text = page.locator("body").inner_text()[:500]
        log.error("Login ไม่สำเร็จ ค้างอยู่ที่ URL: %s", stuck_url)
        log.error("ข้อความที่เห็นบนหน้าจอตอนนั้น: %s", visible_text)
        raise RuntimeError(
            f"เข้าสู่ระบบไม่สำเร็จ ค้างอยู่ที่ {stuck_url} — "
            "อาจเป็นเพราะเซสชันเดิมยังไม่ถูกล็อกเอาต์ หรือเซิร์ฟเวอร์ตอบช้า "
            "ดู log บรรทัดก่อนหน้าสำหรับข้อความที่ขึ้นบนหน้าจอจริง"
        )
    log.info("เข้าสู่ระบบสำเร็จ")


def go_to_discipline_search(page: Page) -> None:
    page.goto(f"{BASE_URL}/index.php?p=pks_home&mod=4")


def search_student(page: Page, student_id: str) -> bool:
    log.info("ค้นหานักเรียนรหัส %s", student_id)
    page.fill('input[name="txtsearch"]', student_id)
    page.click('button:has-text("เลือก / ค้นหา"), input[value*="เลือก"]')
    page.wait_for_load_state("networkidle")

    student_link = page.locator(f'a.users-list-name[href*="student_id={student_id}"]')
    if student_link.count() == 0:
        log.warning("ไม่พบนักเรียนรหัส %s ในระบบ RMS", student_id)
        return False

    student_link.first.click()
    page.wait_for_load_state("networkidle")
    return True


def already_has_ref(page: Page, uuid: str) -> bool:
    """เช็คตาราง 'พฤติกรรม' บนหน้ารายบุคคลว่ามีรายการที่ฝัง REF tag นี้อยู่แล้วหรือไม่
    กันบอทบันทึกซ้ำเวลารันซ้ำ (เช่น รอบก่อนหน้าสำเร็จแต่บอทถูกตัดตอนก่อนอัปเดตสถานะกลับ)"""
    return page.get_by_text(ref_tag(uuid)).count() > 0


def resolve_incor_id(page: Page, offense_text: str) -> str:
    """ค้นข้อความ match_text ในตัวเลือกจริงของ <select name="incor_id"> ตอนรัน
    (ไม่ใช้เลข id ที่จำไว้ล่วงหน้า) คืนค่า value ที่ตรงกัน หรือ raise ถ้าไม่พบ

    เช็ก 2 รอบ:
    1) หาตัวเลือกที่ข้อความ (ตัดเลขคะแนนนำหน้า "N - " ออกแล้ว) ตรงกับ match_text
       แบบเป๊ะๆ ก่อนเสมอ — กันปัญหาหมวดสั้นๆ เช่น "ทะเลาะวิวาท" ไปจับคู่ผิดกับ
       หมวดอื่นที่มีคำเดียวกันปนอยู่ในชื่อยาวๆ (เช่น "ก่อเหตุทะเลาะวิวาทกับ...")
    2) ถ้าไม่เจอที่ตรงเป๊ะเลย ค่อย fallback มาเช็กแบบ "เป็นส่วนหนึ่งของข้อความ"
       เผื่อกรณีที่ match_text ตั้งใจเป็นแค่ช่วงต้นของชื่อเต็มที่ยาวเกินจะพิมพ์ครบ
       (ข้อความใน RMS เองก็ถูกตัดสั้นไว้ที่ ~65 ตัวอักษรอยู่แล้ว)
    """
    entry = get_offense_entry(offense_text)
    if entry is None:
        raise RecordFlaggedForReview(f"ไม่พบฐานความผิด '{offense_text}' ในตารางจับคู่เลย")

    match_text = entry["match_text"]
    options = page.locator('select[name="incor_id"] option')
    substring_match_value = None

    for i in range(options.count()):
        opt = options.nth(i)
        opt_text = opt.inner_text()
        stripped = re.sub(r'^\s*\d+\s*-\s*', '', opt_text).strip()

        if stripped == match_text:
            return opt.get_attribute("value")

        if substring_match_value is None and match_text in opt_text:
            substring_match_value = opt.get_attribute("value")

    if substring_match_value is not None:
        return substring_match_value

    raise RecordFlaggedForReview(
        f"หาตัวเลือก '{match_text}' ไม่เจอในหน้า RMS ตอนนี้ "
        f"(ฐานความผิด EDMS: '{offense_text}', confidence เดิม: {entry['confidence']}) — "
        "อาจยังไม่ได้เพิ่มใน RMS หรือข้อความไม่ตรงกับที่พิมพ์ไว้จริง"
    )


def fill_behavior_record(page: Page, record: dict, dry_run: bool = True) -> dict:
    """record ต้องมี: id (uuid จากชีต Records), offense, date (YYYY-MM-DD), detail (อาจว่าง)"""

    if already_has_ref(page, record["id"]):
        log.info("รายการ %s มีอยู่ใน RMS แล้ว (พบ REF tag) — ข้ามไม่บันทึกซ้ำ", record["id"])
        raise AlreadySynced()

    incor_id = resolve_incor_id(page, record["offense"])

    date_parts = record["date"].split("-")  # YYYY-MM-DD
    year_gregorian, month, day = date_parts[0], int(date_parts[1]), date_parts[2]

    page.locator('select[name="incor_group_id"]').first.scroll_into_view_if_needed()
    page.select_option('select[name="incor_group_id"]', INCOR_GROUP_ID_BEHAVIOR)
    # รอให้หน้าโหลดนิ่งก่อนกรอกวันที่ — ถ้าเปลี่ยนกลุ่มความผิดแล้วเว็บ RMS โหลด
    # ข้อมูลใหม่ผ่าน AJAX (พบรูปแบบนี้ในหลายหน้าของ RMS) แล้วบอทรีบกรอกวันที่ทันที
    # โดยไม่รอ ค่าที่กรอกไปอาจถูกเว็บรีเซ็ตทับกลับเป็นค่าเริ่มต้น (วันที่ปัจจุบัน)
    # ทีหลังโดยไม่รู้ตัว
    page.wait_for_load_state("networkidle")
    page.select_option('select[name="incor_date"]', day.zfill(2))
    page.select_option('select[name="incor_month"]', label=THAI_MONTHS[month])
    # ⚠️ value ของช่องปีเป็น ค.ศ. แม้ label บนจอจะโชว์ พ.ศ. — ต้องเลือกด้วย value
    page.select_option('select[name="incor_year"]', str(int(year_gregorian)))
    page.select_option('select[name="incor_id"]', incor_id)

    detail_text = f"{record.get('detail', '')} {ref_tag(record['id'])}".strip()
    page.fill('textarea[name="student_incor_detail"]', detail_text)

    log.info("กรอกฟอร์มแล้ว: ฐานความผิด='%s' -> incor_id=%s", record["offense"], incor_id)

    if dry_run:
        log.info("[DRY RUN] ไม่กดบันทึกจริง — ตรวจสอบฟอร์มด้วยตาก่อน")
        return {"status": "dry_run", "incor_id": incor_id}

    page.locator('input[type="submit"][value="เพิ่มข้อมูล"]').first.click()
    page.wait_for_load_state("networkidle")

    # TODO: ยืนยันหน้าตาจริงตอนบันทึกสำเร็จ/ล้มเหลว แล้วเสริมเงื่อนไขตรวจสอบผลลัพธ์ตรงนี้
    # วิธีที่ปลอดภัยที่สุดตอนนี้: เช็คซ้ำว่า REF tag ปรากฏในตารางแล้วจริงหลังบันทึก
    page.wait_for_timeout(1000)
    if not already_has_ref(page, record["id"]):
        raise RuntimeError("กดบันทึกแล้วแต่ไม่พบ REF tag ในตาราง — อาจบันทึกไม่สำเร็จ ต้องตรวจสอบด้วยคน")

    return {"status": "submitted", "incor_id": incor_id}


# เว้นช่วงระหว่างรายการ ไม่ยิงคำสั่งกรอกฟอร์ม/บันทึกติดกันเร็วเกินไปจนดูเป็นบอท
# ชัดเกินไปในสายตาระบบ RMS (เดิมเหตุผลนี้ผูกกับ "กันเซสชันเดิมค้างตอน login รอบ
# ถัดไป" ด้วย แต่ตอนนี้ login แค่ครั้งเดียวต่อ batch แล้ว เหตุผลนั้นไม่มีอยู่แล้ว
# เหลือแค่เหตุผลเรื่องจังหวะการยิงคำสั่งอย่างเดียว)
RECORD_PACING_SECONDS = 3


def is_logged_out(page: Page) -> bool:
    """เช็คว่าตอนนี้หลุดเซสชัน RMS แล้วหรือยัง (โดนเด้งกลับไปหน้า login) — ใช้เผื่อ
    เซสชันหมดอายุกลางทางตอนรัน batch ยาวๆ (คิวเยอะ) ให้ run_batch() เข้าสู่ระบบ
    ใหม่อัตโนมัติแทนที่จะปล่อยให้ทุกรายการที่เหลือพังยกแผง"""
    return "p=login" in page.url


def process_one_record(page: Page, record: dict, dry_run: bool = True) -> dict:
    """ประมวลผล 1 รายการด้วย page ที่ login ไว้แล้ว — ไม่เปิด/ปิด browser หรือ
    login เองอีกต่อไป (ดู run_batch() ด้านล่างเป็นผู้ดูแล browser/session ทั้งหมด
    ให้ทั้ง batch ใช้ร่วมกัน แทนที่จะเปิด browser + login ใหม่ทุกรายการแบบเดิม ซึ่ง
    ช้ามากเวลาคิวยาว (login ครั้งละ ~10-20 วิ) และเสี่ยงโดนระบบความปลอดภัยของ RMS
    มองว่า login ถี่ผิดปกติจากบัญชีเดียวกัน)"""
    try:
        go_to_discipline_search(page)

        if not search_student(page, record["studentId"]):
            return {"status": "error", "message": f"ไม่พบนักเรียนรหัส {record['studentId']} ในระบบ RMS"}

        return fill_behavior_record(page, record, dry_run=dry_run)

    except AlreadySynced:
        return {"status": "synced", "message": "มีอยู่ใน RMS แล้ว (ตรวจพบจาก REF tag)"}
    except RecordFlaggedForReview as e:
        log.warning("ต้องตรวจสอบด้วยคน: %s", e)
        return {"status": "needs_review", "message": str(e)}
    except Exception as e:
        log.exception("เกิดข้อผิดพลาดระหว่างประมวลผล")
        return {"status": "error", "message": str(e)}


def run_batch(records: list, dry_run: bool = True, on_record_done=None) -> list:
    """login RMS แค่ครั้งเดียว แล้ววนประมวลผลทุกรายการในคิวด้วย browser/session
    เดียวกัน — เรียก on_record_done(record, outcome, duration_seconds) ทันทีหลัง
    แต่ละรายการเสร็จถ้าใส่มา (ให้ main.py รายงานสถานะกลับ GAS แบบเรียลไทม์ทีละ
    รายการเหมือนเดิมทุกประการ ไม่ต้องรอจบทั้ง batch ก่อน กันผลลัพธ์หายไปทั้งหมดถ้า
    batch ล้มกลางทาง) คืนค่า list ของ (record, outcome, duration_seconds) ทั้งหมด
    ด้วยเผื่อผู้เรียกอยากได้สรุปตอนจบ

    raise ถ้า login RMS ครั้งแรกไม่สำเร็จเลย (ยังไม่ได้ประมวลผลอะไรเลยสักรายการ)
    ให้ main.py จับไปแจ้งเตือนผู้ดูแลระบบต่อได้ว่าทั้ง batch ไม่ได้เริ่มทำงานจริง
    """
    if not RMS_BOT_USERNAME or not RMS_BOT_PASSWORD:
        raise RuntimeError(
            "ยังไม่ได้ตั้งค่าบัญชี RMS — รัน setup_credentials.py "
            "(หรือดับเบิลคลิก setup_credentials.bat) ก่อนครับ"
        )

    results = []
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=not dry_run)
        except Exception as e:
            # 🧭 ข้อผิดพลาดที่เจอบ่อยที่สุดตอนตั้งเครื่องใหม่/เครื่องที่ยังไม่เคยรัน
            # บอทเลย — ลง pip package "playwright" แล้ว แต่ลืมรันคำสั่งดาวน์โหลดตัว
            # เบราว์เซอร์จริง (เป็นคนละขั้นตอนกัน) ข้อความ error เดิมของ Playwright
            # เป็นภาษาอังกฤษยาวๆ อ่านเข้าใจยากสำหรับคนไม่ถนัดเขียนโปรแกรม แปลงเป็น
            # คำสั่งที่ทำตามได้ทันทีแทน
            if 'Executable doesn' in str(e) or 'playwright install' in str(e):
                raise RuntimeError(
                    "ยังไม่ได้ติดตั้งเบราว์เซอร์สำหรับ Playwright (ทำครั้งเดียวหลังลง "
                    "requirements.txt) — เปิด PowerShell ในโฟลเดอร์ rpa-bot แล้วรันคำสั่ง: "
                    "playwright install chromium"
                ) from e
            raise

        try:
            page = browser.new_page()
            login(page, RMS_BOT_USERNAME, RMS_BOT_PASSWORD)

            for i, record in enumerate(records):
                if is_logged_out(page):
                    log.warning("เซสชัน RMS ดูเหมือนจะหมดอายุกลางทาง (คิวยาว) — เข้าสู่ระบบใหม่อัตโนมัติ")
                    login(page, RMS_BOT_USERNAME, RMS_BOT_PASSWORD)

                started_at = time.time()
                outcome = process_one_record(page, record, dry_run=dry_run)
                duration_seconds = time.time() - started_at

                results.append((record, outcome, duration_seconds))
                if on_record_done:
                    on_record_done(record, outcome, duration_seconds)

                if i < len(records) - 1:
                    time.sleep(RECORD_PACING_SECONDS)
        finally:
            browser.close()

    return results


if __name__ == "__main__":
    sample_record = {
        "id": "test-uuid-0001",
        "studentId": "68219100062",
        "offense": "แต่งกายผิดระเบียบ",
        "date": "2026-08-27",
        "detail": "ทดสอบระบบ RPA (dry run)",
    }
    print(run_batch([sample_record], dry_run=True))
