# ระบบตัดคะแนนความประพฤติ — วิทยาลัยเทคนิคสมุทรสาคร

ระบบบันทึกและติดตามพฤติกรรมนักเรียน นักศึกษา ตามระเบียบวิทยาลัยฯ ว่าด้วยหลักเกณฑ์การพิจารณาลงโทษ
พ.ศ. 2566 ประกอบด้วย 3 ส่วนที่ทำงานร่วมกัน

```
  ครู/ผู้บริหาร                    Google Sheets (ฐานข้อมูล)              ระบบ RMS เดิมของวิทยาลัย
  (เว็บแอป React) --HTTPS--> Google Apps Script (backend) <--HTTPS-- บอท RPA (Python/Playwright)
                                                                            |
                                                                            +--> กรอกข้อมูลเข้า RMS
```

| ส่วน | โฟลเดอร์ | หน้าที่ |
|---|---|---|
| เว็บแอป | `src/`, `public/`, `index.html` | บันทึกตัดคะแนน (สแกนบัตรด้วย AI), รายงาน, ประวัตินักเรียน, ทัณฑ์บน, แผงควบคุม, จัดการผู้ใช้, ประวัติการทำงานระบบ |
| Backend | `gas-backend-COMPLETE-v3/` | Google Apps Script: ตรวจสิทธิ์ อ่าน/เขียนชีต สร้าง PDF สแกนบัตร บันทึก Audit Log |
| บอท RPA | `rpa-bot/` | นำรายการที่ยัง `pending` ไปบันทึกเข้า RMS อัตโนมัติ (ดู `rpa-bot/README.md`) |

## ระดับสิทธิ์ผู้ใช้ (บังคับที่ backend เสมอ หน้าเว็บแค่ซ่อนเมนู)

| ระดับ | บทบาทตัวอย่าง | ทำได้ |
|---|---|---|
| ผู้ดูแลระบบ | ผู้ดูแลระบบ, หัวหน้างานปกครอง, เจ้าหน้าที่งานปกครอง | ทุกอย่าง รวมจัดการผู้ใช้ ลบรายการ ดู Audit Log |
| เห็นทุกรายการ | ครูปกครอง, รองผู้อำนวยการ, ผู้อำนวยการ | เห็นและบันทึกทัณฑ์บนของทุกรายการ ไม่มีสิทธิ์จัดการผู้ใช้ |
| ทั่วไป | ครูผู้สอน | บันทึกตัดคะแนน เห็น/แก้ไขเฉพาะรายการที่ตัวเองบันทึก |

## รันเว็บแอปเพื่อพัฒนา

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint
npm run build      # ผลลัพธ์อยู่ที่ dist/ (Netlify build ให้อัตโนมัติเมื่อ push ขึ้น main)
```

เว็บเชื่อมกับ Apps Script ผ่าน URL ใน `src/services/api.js` (ค่า `GAS_API_URL`)

## Deploy Backend (Apps Script) — ต้องทำเองทุกครั้งที่แก้ไฟล์ .gs

1. เปิด Apps Script Editor ของสเปรดชีต วางเนื้อหาไฟล์ที่เปลี่ยนจาก `gas-backend-COMPLETE-v3/` ทับของเดิม
2. **Deploy -> Manage deployments -> ไอคอนดินสอ -> Version: New version -> Deploy**
3. ถ้าได้ URL ใหม่ ต้องแก้ให้ตรงกัน **ทั้ง 2 ที่**: `src/services/api.js` และ `rpa-bot/sheets_queue.py`
   (`DEFAULT_GAS_API_URL`; เครื่องที่ใช้บอทแบบ .exe แก้ที่ `config.json` ข้างโปรแกรมแทน)
4. ตั้งค่าครั้งเดียวใน Script Properties: `TYPHOON_API_KEY` (คีย์สแกนบัตร) และใน `Config.gs`:
   `ADMIN_ALERT_EMAIL` (อีเมลรับแจ้งเตือน error), `BOT_USERNAMES` (ชื่อบัญชีบอท ค่าเริ่มต้น `rpa-bot`)

### ฟังก์ชันตั้งค่าครั้งเดียว (เลือกฟังก์ชันใน Editor แล้วกด Run — รันซ้ำได้ปลอดภัย)

| ฟังก์ชัน | ใช้เมื่อ |
|---|---|
| `setupSyncColumns`, `setupDeleteColumn`, `setupCreatedByColumn`, `setupClientRequestIdColumn` | เตรียมคอลัมน์ในชีต Records |
| `setupSaltColumn`, `setupEmailColumn` | เตรียมคอลัมน์ในชีต Users |
| `setupProbationSheet`, `backfillProbationIds_` | สร้างชีตทัณฑ์บน / เติมรหัสให้แถวเก่า |
| `setupPdfBackgroundTrigger`, `setupDailyBackupTrigger` | ตั้งเวลาสร้าง PDF เบื้องหลัง / สำรองข้อมูลทุกวัน |
| `migrateExistingPdfSharingToStaffOnly_` | จำกัดการแชร์ PDF เก่าให้เฉพาะบุคลากร (ต้องกรอกอีเมลผู้ใช้ให้ครบก่อน) |

## ความปลอดภัยที่ควรรู้

- ทุก action ยกเว้น `login` ต้องมี session token; สิทธิ์ตรวจซ้ำที่ backend ทุกครั้ง
- ลบผู้ใช้ / เปลี่ยนบทบาท / รีเซ็ตรหัสผ่าน จะยกเลิก token เดิมของบัญชีนั้นทันที
- ช่องข้อความอิสระทุกช่องผ่าน `sanitizeForSheetCell_` กันสูตร Sheets และหน้าเว็บ escape HTML ก่อนแสดง
- action ของบอท RPA จำกัดเฉพาะผู้ดูแลระบบและบัญชีใน `BOT_USERNAMES`
- ห้ามใส่ความลับในตัวแปร `VITE_*` (Vite ฝังลงโค้ดที่ส่งให้ผู้ใช้ทุกคน)
