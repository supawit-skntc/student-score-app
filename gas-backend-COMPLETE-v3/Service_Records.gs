// ==========================================
// ไฟล์ Service_Records.gs : CRUD หลักของรายการตัดคะแนน (ชีต Records)
// ฟังก์ชันที่เกี่ยวกับ RPA Bot (คิวงาน, สถิติ) แยกไปอยู่ Service_RpaBot.gs แล้ว
// ==========================================

// ฐานความผิดที่ห้ามตัดซ้ำในวันเดียวกัน — ให้โอกาสนักเรียนไปแก้ไขก่อน (เช่น
// แต่งกาย/ทรงผม) ส่วนความผิดอื่นที่เหลือ (สูบบุหรี่, ทะเลาะวิวาท, อื่นๆ ฯลฯ)
// ยังตัดซ้ำในวันเดียวกันได้ตามปกติเพราะทำผิดซ้ำได้จริง
// ⚠️ ต้องตรงกับ src/data/offenses.js ฝั่งเว็บเสมอ (ฟิลด์ noRepeatSameDay) —
// แก้ที่นี่แล้วต้องไปแก้ที่นั่นด้วย ไม่งั้นข้อความเตือนหน้าเว็บกับพฤติกรรมจริง
// จะไม่ตรงกัน
const NO_REPEAT_SAME_DAY_OFFENSES = ["แต่งกายผิดระเบียบ", "ทรงผมผิดระเบียบ/ทำสีผม"];

// แปลงค่าวันที่จากเซลล์ชีต (อาจเป็น Date object หรือ string ก็ได้) ให้เป็น
// "YYYY-MM-DD" เพื่อเทียบกับ data.date ที่ส่งมาจากฟอร์ม (input type="date")
function toIsoDateString_(rawDate) {
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return String(rawDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// เช็กว่านักเรียนคนนี้เคยถูกบันทึกฐานความผิดเดียวกันนี้ในวันเดียวกันไปแล้วหรือยัง
function hasSameDayDuplicate_(studentId, offense, dateStr) {
  const rows = readActiveRecordRows_();
  if (!rows) return false;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[3]).trim() !== String(studentId).trim()) continue;
    if (String(row[10]).trim() !== offense) continue;
    if (toIsoDateString_(row[2]) === dateStr) return true;
  }
  return false;
}

// ==========================================
// 🔁 กันบันทึกซ้ำ (idempotency) — ปุ่ม "บันทึกข้อมูล" เป็นขั้นตอนที่ช้าที่สุดใน
// ระบบ (สร้าง PDF หลายวินาที) ยิ่ง request ใช้เวลานาน ยิ่งมีโอกาสที่ Google จะทำ
// response หายกลางทางก่อนถึงเบราว์เซอร์ ทั้งที่บันทึกสำเร็จลงชีตไปแล้วจริง (เจอ
// เคสจริงแล้ว) ฝั่งเว็บจะสุ่ม clientRequestId มาแนบด้วยทุกครั้งที่เปิดฟอร์ม — ถ้า
// เจอว่ารหัสนี้เคยถูกบันทึกไปแล้ว ให้ถือว่าสำเร็จทันที ไม่สร้าง PDF ซ้ำ ไม่เพิ่ม
// แถวซ้ำเด็ดขาด (คอลัมน์ T: Client_Request_Id — ดู setupClientRequestIdColumn)
// ==========================================
function findRecordByClientRequestId_(clientRequestId) {
  const rows = readActiveRecordRows_();
  if (!rows) return null;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][19] || "") === String(clientRequestId)) {
      return { id: String(rows[i][0] || ""), pdfUrl: String(rows[i][13] || "") };
    }
  }
  return null;
}

function processRecordTransaction(token, data) {
  const session = getSession(token);

  try {
    if (data.clientRequestId) {
      const existing = findRecordByClientRequestId_(data.clientRequestId);
      if (existing) {
        logAudit(data.teacherName, "CREATE_RECORD", data.studentId, "SUCCESS (duplicate submit — already recorded)");
        return { status: "success", message: "บันทึกสำเร็จ", id: existing.id, pdfUrl: existing.pdfUrl };
      }
    }

    if (NO_REPEAT_SAME_DAY_OFFENSES.indexOf(data.offense) !== -1 &&
        hasSameDayDuplicate_(data.studentId, data.offense, data.date)) {
      logAudit(data.teacherName, "CREATE_RECORD", data.studentId, "BLOCKED_DUPLICATE_SAME_DAY: " + data.offense);
      return {
        status: "error",
        message: `นักเรียนคนนี้ถูกบันทึก "${data.offense}" ไปแล้วในวันที่ ${data.date} — ฐานความผิดนี้ตัดซ้ำในวันเดียวกันไม่ได้ ให้โอกาสนักเรียนไปแก้ไขก่อน`,
      };
    }

    const uuid = Utilities.getUuid();
    const timestamp = new Date().toISOString();

    const rowData = [
      uuid, timestamp, data.date, data.studentId, data.nameTitle || "",
      data.studentName, data.fieldOfStudy, data.level, data.year, data.room,
      data.offense, data.points, data.teacherName,
      // 🚀 N: pdfUrl — เว้นว่างไว้ก่อนเสมอ "ไม่" สร้าง PDF ในคำขอนี้อีกต่อไป (เดิม
      // สร้าง PDF ก่อนเขียนแถว ทำให้ปุ่มบันทึกช้า (หลายวินาที) และถ้าขั้นตอนสร้าง
      // PDF พังกลางทาง รายการทั้งหมดจะไม่ถูกบันทึกเลยแม้แต่แถวเดียว) ตอนนี้บันทึก
      // แถวข้อมูลก่อนทันที (เร็ว แทบไม่มีทางล้มเหลว) แล้วให้ฝั่งเว็บเรียก action
      // "generateRecordPdf" ต่อทันทีแบบแยกคำขอ (ดู Service_PDF.gs) — ถ้าคำขอนั้น
      // ล้มเหลว/หายกลางทาง ข้อมูลนักเรียนก็ยังปลอดภัยอยู่แล้ว ไม่หายไปด้วย และมี
      // trigger เบื้องหลัง (processPendingPdfs_) คอยสร้างซ้ำให้อัตโนมัติทุก 1 นาที
      "",
      // 🆕 คอลัมน์ O, P, Q — ให้ RPA Bot (Python) ใช้เป็นคิวงานอ่าน/เขียนสถานะ
      // ผ่าน Google Sheets API โดยตรง (ไม่ผ่าน GAS) ค่าเริ่มต้นทุกรายการใหม่คือ
      // "pending" แปลว่า "ยังไม่เคยถูกส่งไปบันทึกใน RMS"
      "pending", "", "",
      "", // R: Deleted_At (ว่างไว้ — ยังไม่ถูกลบ)
      // 🆕 S: Created_By_Username — ใช้กับ getMyRecords() ให้ครูทั่วไปเห็นเฉพาะ
      // รายการที่ตัวเองบันทึก (admin ยังเห็นทุกรายการเหมือนเดิม) รายการเก่าก่อน
      // เพิ่มคอลัมน์นี้จะว่างไว้ ซึ่ง getMyRecords() ถือว่า "เห็นได้ทุกคน" เพื่อไม่
      // ให้ข้อมูลเก่าหายไปจากทุกคนกะทันหันตอนเปิดใช้ฟีเจอร์นี้ครั้งแรก
      session ? session.username : "",
      // 🆕 T: Client_Request_Id — ดูคำอธิบายเต็มที่ findRecordByClientRequestId_
      // ด้านบน ใช้กันบันทึกซ้ำเวลา response หายกลางทางแม้บันทึกจริงสำเร็จแล้ว
      data.clientRequestId || "",
    ];

    // 🔒 ขอ lock เฉพาะช่วง "เขียนแถวใหม่" ซึ่งเป็นขั้นตอนเดียวที่ต้องกันชนกัน
    // จริงๆ (สองคนกด appendRow พร้อมกันเป๊ะอาจไปเขียนทับแถวว่างเดียวกัน) ใช้เวลา
    // แค่เสี้ยววินาที ไม่ใช่หลายวินาทีเหมือนตอนคลุม PDF ไปด้วย
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName("Records");
      sheet.appendRow(rowData);
      invalidateRecordsCache_();
    } finally {
      lock.releaseLock();
    }

    logAudit(data.teacherName, "CREATE_RECORD", data.studentId, "SUCCESS");

    return { status: "success", message: "บันทึกสำเร็จ", id: uuid, pdfUrl: "" };

  } catch (e) {
    logAudit(data.teacherName, "CREATE_RECORD", data.studentId, "FAILED: " + e.message);
    return { status: "error", message: "ระบบเกิดข้อผิดพลาด: " + e.message };
  }
}

// ==========================================
// 1. อ่านแถวข้อมูลดิบจากชีต (ข้ามรายการที่ถูกลบไปแล้ว) — ใช้ร่วมกันระหว่าง
// getRecords() และ getMyRecords() กันโค้ดอ่าน/แปลงข้อมูลซ้ำกันสองที่
//
// 🚀 แคชผลลัพธ์ไว้ 30 วินาที (CacheService) — เดิมทุกครั้งที่เปิดแผงควบคุม/
// รายงาน/ประวัตินักเรียน จะอ่านทั้งชีต Records ใหม่หมดทุกครั้ง ยิ่งชีตมีแถวเยอะ
// ก็ยิ่งช้า และยิ่งมีคนเปิดพร้อมกันหลายคน + RPA bot ก็ยิ่งเสี่ยงชนโควตาการอ่าน
// ของ Google (ทำให้เจอ error แปลกๆ เป็นระยะ) แคชนี้ตัดการอ่านซ้ำซ้อนออกไปเยอะ
// โดยไม่กระทบสิทธิ์การมองเห็น เพราะ cache เก็บแค่ "ข้อมูลดิบทุกแถว" การกรองว่า
// ใครเห็นรายการไหน (ดู getMyRecords) ยังทำสดใหม่ทุกครั้งจาก session ปัจจุบัน
//
// ⚠️ CacheService จำกัดขนาดค่าต่อ 1 คีย์ไว้ที่ ~100KB — ถ้าข้อมูลใหญ่เกินนี้
// (ชีตมีหลายพันแถว) จะข้ามการแคชไปเฉยๆ ไม่ error แค่ไม่ได้ประโยชน์จากแคชต่อ
// ==========================================
const RECORDS_CACHE_KEY = 'records_raw_rows_v1';
const RECORDS_CACHE_TTL_SECONDS = 30;

function readActiveRecordRows_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(RECORDS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // แคชอ่านไม่ขึ้น (ข้อมูลเพี้ยน/หมดอายุพอดี) — อ่านจากชีตตามปกติแทน
    }
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][17]) continue; // ข้ามรายการที่ถูกลบไปแล้ว (soft delete — คอลัมน์ R)
    rows.push(data[i]);
  }

  try {
    const serialized = JSON.stringify(rows);
    if (serialized.length < 95000) {
      cache.put(RECORDS_CACHE_KEY, serialized, RECORDS_CACHE_TTL_SECONDS);
    }
  } catch (e) {
    // แคชพังไม่ควรทำให้ทั้งฟังก์ชันพังตาม — ปล่อยผ่าน ใช้ข้อมูลสดที่อ่านมาได้ตามปกติ
  }

  return rows;
}

// เรียกทันทีหลังบันทึก/แก้ไข/ลบรายการสำเร็จ กันไม่ให้เห็นข้อมูลเก่าค้างในแคช
// นานถึง 30 วินาทีหลังเพิ่งมีการเปลี่ยนแปลงจริง
function invalidateRecordsCache_() {
  CacheService.getScriptCache().remove(RECORDS_CACHE_KEY);
}

// ==========================================
// ค้นหาตำแหน่งแถวของรายการที่มี id (คอลัมน์ A) ตรงกับที่ให้มา — รวมโค้ดที่เดิม
// กระจายซ้ำกันอยู่ 3 ที่ (updateRecord, deleteRecord, updateSyncStatus ใน
// Service_RpaBot.gs) มาไว้ที่เดียว กันแก้ตรงนึงแล้วลืมอีกตรงนึง
// คืนค่า rowIndex แบบ 1-indexed (นับรวมหัวตาราง) หรือ null ถ้าไม่เจอ
// ==========================================
function findRecordRowIndexById_(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      return i + 1;
    }
  }
  return null;
}

// ==========================================
// 🚀 แคชตำแหน่งแถวของทุกรายการ (ไม่ใช่แค่ที่ยังไม่ถูกลบ) ไว้สั้นๆ — ให้
// updateSyncStatus() ใน Service_RpaBot.gs ใช้ระหว่างที่บอทกำลังรันอยู่ ไม่ต้อง
// อ่านทั้งชีตใหม่ทุกครั้งที่มีรายการเสร็จ 1 รายการ (เดิมบอทเรียก updateSyncStatus
// ทีละรายการ แล้วแต่ละครั้งก็ getDataRange().getValues() ใหม่หมด — คิว 10 รายการ
// = อ่านทั้งชีต 10 รอบรัวๆ ติดกัน ยิ่งเสี่ยงชนโควตา/เกิด error แปลกๆ ของ Google)
//
// ปลอดภัยที่จะแคชตำแหน่งแถวไว้ได้ (ต่างจากเนื้อหาข้อมูลที่ห้ามแคชนาน) เพราะระบบนี้
// ไม่มีจุดไหนเรียก deleteRow()/insertRow() กับชีต Records เลย (ลบรายการใช้ soft
// delete เขียนคอลัมน์ R แทน) แถวจึงไม่มีวันขยับตำแหน่งตราบใดที่ยังไม่ถูกลบแถวจริง
// ==========================================
const SYNC_ROW_INDEX_CACHE_KEY = 'records_row_index_by_id_v1';
const SYNC_ROW_INDEX_CACHE_TTL_SECONDS = 600; // 10 นาที ครอบคลุมเวลารันบอท 1 รอบสบายๆ

function cacheRecordRowIndexMap_(rowIndexById) {
  try {
    const serialized = JSON.stringify(rowIndexById);
    if (serialized.length < 95000) {
      CacheService.getScriptCache().put(SYNC_ROW_INDEX_CACHE_KEY, serialized, SYNC_ROW_INDEX_CACHE_TTL_SECONDS);
    }
  } catch (e) {
    // แคชพังไม่ควรทำให้ฟังก์ชันหลักพังตาม — ปล่อยผ่าน ใช้การอ่านสดตามปกติแทน
  }
}

// คืนตำแหน่งแถวจากแคชถ้ามี (เร็ว ไม่ต้องอ่านทั้งชีต) หรือ null ถ้าไม่เจอในแคช
// (แคชหมดอายุ หรือรายการนี้ถูกสร้างหลังจากแคชล่าสุด) — ผู้เรียกต้อง fallback ไป
// ใช้ findRecordRowIndexById_() เองเสมอเมื่อได้ null กลับมา ห้ามถือว่า "ไม่พบ"
function getCachedRecordRowIndex_(id) {
  const cached = CacheService.getScriptCache().get(SYNC_ROW_INDEX_CACHE_KEY);
  if (!cached) return null;
  try {
    const map = JSON.parse(cached);
    return map[String(id)] || null;
  } catch (e) {
    return null;
  }
}

function mapRowToRecord_(row) {
  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

  let rawDate = row[2];
  let formattedDate = "";
  let inputDateStr = "";

  if (rawDate) {
    let d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      formattedDate = `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
      inputDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } else {
      formattedDate = String(rawDate);
      inputDateStr = String(rawDate);
    }
  }

  return {
    id: String(row[0] || ""),
    displayDate: formattedDate,
    date: inputDateStr,
    studentId: String(row[3] || ""),
    nameTitle: String(row[4] || ""),
    studentName: String(row[5] || ""),
    displayFullName: String(row[4] || "") + String(row[5] || ""),
    fieldOfStudy: String(row[6] || ""),
    level: String(row[7] || ""),
    year: String(row[8] || ""),
    room: String(row[9] || ""),
    displayLevel: String(row[7] || "") + " ปี " + String(row[8] || "") + "/" + String(row[9] || ""),
    offense: String(row[10] || ""),
    points: String(row[11] || ""),
    teacherName: String(row[12] || ""),
    pdfUrl: String(row[13] || ""),
    // 🆕 ส่งสถานะ sync ไปให้ frontend ด้วย เผื่อใช้แสดง badge ในอนาคต
    // (เช่น "รอ RPA ประมวลผล" / "บันทึกเข้า RMS แล้ว" / "รอตรวจสอบ")
    rmsSyncStatus: String(row[14] || ""),
    rmsSyncedAt: String(row[15] || ""),
    rmsNote: String(row[16] || ""),
  };
}

// ==========================================
// 2. ฟังก์ชันดึงข้อมูล "ทั้งหมด" ให้หน้า React — ใช้กับหน้าประวัตินักเรียน/แผง
// ควบคุมที่ต้องดูคะแนนสะสมของนักเรียนทุกคนได้ ไม่ว่าใครจะเป็นคนบันทึกก็ตาม
// ==========================================
function getRecords() {
  const rows = readActiveRecordRows_();
  if (rows === null) return { status: "error", message: "ไม่พบแผ่นงานข้อมูลระบบ" };
  return { status: "success", data: rows.map(mapRowToRecord_).reverse() };
}

// ==========================================
// 2.1 ฟังก์ชันดึงข้อมูล "เฉพาะที่เกี่ยวข้องกับตัวเอง" — หน้ารายงานใช้แทน getRecords()
// admin เห็นทุกรายการเหมือนเดิม ส่วนครูทั่วไปเห็นเฉพาะรายการที่ตัวเองบันทึก (+
// รายการเก่าก่อนมีคอลัมน์ Created_By_Username ซึ่งยังเปิดให้ทุกคนเห็นเหมือนเดิม
// เพื่อไม่ให้ข้อมูลเก่าหายไปกะทันหัน)
// ==========================================
function getMyRecords(token) {
  const session = requireSession(token);
  const canSeeAll = ADMIN_ROLES.indexOf(session.role) !== -1 || FULL_VISIBILITY_ROLES.indexOf(session.role) !== -1;

  const rows = readActiveRecordRows_();
  if (rows === null) return { status: "error", message: "ไม่พบแผ่นงานข้อมูลระบบ" };

  const visibleRows = rows.filter((row) => {
    if (canSeeAll) return true;
    const createdBy = String(row[18] || "").trim();
    return !createdBy || createdBy === session.username;
  });

  return { status: "success", data: visibleRows.map(mapRowToRecord_).reverse() };
}

// ==========================================
// 3. ฟังก์ชันอัปเดตข้อมูลแบบ Full Option และสร้าง PDF ใหม่
// ==========================================
function updateRecord(token, updatedData) {
  // ใช้ session ปัจจุบันบันทึก audit log แทน updatedData.teacherName เพราะฟิลด์นั้น
  // เป็นชื่อคนที่ "สร้าง" รายการตอนแรก ไม่ใช่คนที่กำลังแก้ไขอยู่ตอนนี้ — ถ้าครูอีก
  // คนมาแก้รายการของเพื่อนร่วมงาน log เดิมจะโยนความผิดให้คนแรกผิดตัว
  const session = getSession(token);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) return { status: "error", message: "ไม่พบแผ่นงานข้อมูลระบบ" };

  const rowIndex = findRecordRowIndexById_(sheet, updatedData.id);
  if (rowIndex === null) return { status: "error", message: "ไม่พบข้อมูลที่ต้องการแก้ไข" };

  const oldPdfUrl = String(sheet.getRange(rowIndex, 14).getValue());
  try {
    if (oldPdfUrl) {
      const fileIdMatch = oldPdfUrl.match(/[-\w]{25,}/);
      if (fileIdMatch) DriveApp.getFileById(fileIdMatch[0]).setTrashed(true);
    }
  } catch (err) { console.error("ไม่สามารถลบไฟล์ PDF เดิมได้: " + err); }

  const newPdfUrl = generatePDF(updatedData, updatedData.id);

  sheet.getRange(rowIndex, 3).setValue(updatedData.date);
  sheet.getRange(rowIndex, 4).setValue(updatedData.studentId);
  sheet.getRange(rowIndex, 5).setValue(updatedData.nameTitle);
  sheet.getRange(rowIndex, 6).setValue(updatedData.studentName);
  sheet.getRange(rowIndex, 7).setValue(updatedData.fieldOfStudy);
  sheet.getRange(rowIndex, 8).setValue(updatedData.level);
  sheet.getRange(rowIndex, 9).setValue(updatedData.year);
  sheet.getRange(rowIndex, 10).setValue(updatedData.room);
  sheet.getRange(rowIndex, 11).setValue(updatedData.offense);
  sheet.getRange(rowIndex, 12).setValue(updatedData.points);
  sheet.getRange(rowIndex, 13).setValue(updatedData.teacherName);
  sheet.getRange(rowIndex, 14).setValue(newPdfUrl);

  // 🆕 แก้ไขเนื้อหาแล้ว ควรส่งกลับไป sync ใหม่ใน RMS อีกครั้ง
  // (ไม่แตะ RMS_Synced_At/RMS_Note เดิม เผื่ออยากเทียบย้อนหลังว่าครั้งก่อน sync ไว้เมื่อไร)
  sheet.getRange(rowIndex, 15).setValue("pending");
  invalidateRecordsCache_();

  logAudit(session.username, "UPDATE_RECORD", updatedData.studentId, "SUCCESS");

  return { status: "success", message: "อัปเดตข้อมูลและเอกสาร PDF เรียบร้อยแล้ว", newPdfUrl: newPdfUrl };
}

// ==========================================
// 4. ลบรายการ (soft delete) — เฉพาะผู้ดูแลระบบเท่านั้น
// ไม่ได้ลบแถวออกจากชีตจริงๆ แค่ทำเครื่องหมายไว้ที่คอลัมน์ R (Deleted_At) แล้วให้
// getRecords()/getSyncQueue() กรองรายการนี้ออกไปเสมอ — เก็บแถวไว้เพื่อรักษาความ
// น่าเชื่อถือของประวัติ (ตรวจสอบย้อนหลังได้ว่าเคยมีรายการนี้และใครลบไปเมื่อไร)
//
// ⚠️ ข้อจำกัดสำคัญ: ถ้ารายการนี้ถูกบอท RPA ส่งเข้า RMS ไปแล้ว (RMS_Sync_Status =
// "synced") การลบที่นี่จะไม่ไปลบข้อมูลใน RMS ให้อัตโนมัติ เพราะบอทยังไม่มี
// ความสามารถลบข้อมูลในระบบ RMS เลย ต้องเข้าไปลบเองในนั้นด้วยมือถ้าจำเป็น
// ==========================================
function deleteRecord(token, id) {
  const session = requireAdmin(token);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) return { status: "error", message: "ไม่พบแผ่นงานข้อมูลระบบ" };

  const rowIndex = findRecordRowIndexById_(sheet, id);
  if (rowIndex === null) return { status: "error", message: "ไม่พบรายการที่ id นี้: " + id };

  const studentId = String(sheet.getRange(rowIndex, 4).getValue() || "");
  sheet.getRange(rowIndex, 18).setValue(new Date().toISOString());
  invalidateRecordsCache_();
  logAudit(session.username, "DELETE_RECORD", studentId, "SUCCESS");
  return { status: "success", message: "ลบรายการเรียบร้อยแล้ว" };
}

// ==========================================
// 5. รันครั้งเดียวจาก Apps Script Editor (เลือกฟังก์ชันนี้แล้วกด Run)
// เพื่อเตรียมคอลัมน์ R (Deleted_At) สำหรับฟีเจอร์ "ลบรายการ" (soft delete)
// ==========================================
function setupDeleteColumn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) throw new Error("ไม่พบแผ่นงาน Records");

  const headerCell = sheet.getRange(1, 18); // คอลัมน์ R
  if (!headerCell.getValue()) {
    headerCell.setValue("Deleted_At");
  }

  Logger.log("ตั้งค่าคอลัมน์ Deleted_At เรียบร้อยแล้ว");
}

// ==========================================
// 6. รันครั้งเดียวจาก Apps Script Editor เช่นกัน เพื่อเตรียมคอลัมน์ S
// (Created_By_Username) สำหรับฟีเจอร์ "ครูทั่วไปเห็นเฉพาะรายการที่ตัวเองบันทึก"
// ==========================================
function setupCreatedByColumn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) throw new Error("ไม่พบแผ่นงาน Records");

  const headerCell = sheet.getRange(1, 19); // คอลัมน์ S
  if (!headerCell.getValue()) {
    headerCell.setValue("Created_By_Username");
  }

  Logger.log("ตั้งค่าคอลัมน์ Created_By_Username เรียบร้อยแล้ว");
}

// ==========================================
// 7. รันครั้งเดียวจาก Apps Script Editor เช่นกัน เพื่อเตรียมคอลัมน์ T
// (Client_Request_Id) สำหรับฟีเจอร์กันบันทึกซ้ำ (idempotency) ของปุ่ม
// "บันทึกข้อมูล" — ดูคำอธิบายเต็มที่ findRecordByClientRequestId_
// ==========================================
function setupClientRequestIdColumn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) throw new Error("ไม่พบแผ่นงาน Records");

  const headerCell = sheet.getRange(1, 20); // คอลัมน์ T
  if (!headerCell.getValue()) {
    headerCell.setValue("Client_Request_Id");
  }

  Logger.log("ตั้งค่าคอลัมน์ Client_Request_Id เรียบร้อยแล้ว");
}
