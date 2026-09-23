// ==========================================
// ไฟล์ Service_Probation.gs : ติดตามสถานะทัณฑ์บนของนักเรียน แยกจากคะแนนสะสม
// (ชีต Records) โดยตั้งใจ — ตามระเบียบวิทยาลัยเทคนิคสมุทรสาครข้อ 8.3 คะแนนสะสม
// รีเซ็ตทุกปีการศึกษาตามปกติ (ดู src/data/thresholds.js ฝั่งเว็บ) "ยกเว้น"
// ประวัติทัณฑ์บนที่ควรอยู่ติดตัวนักเรียนไปตลอด ไม่ถูกรีเซ็ตไปกับคะแนน — ระบบเดิม
// ไม่มีที่เก็บข้อมูลนี้เลย (คอมเมนต์ใน thresholds.js เขียนไว้เป็น TODO มาตั้งแต่
// ก่อนหน้านี้)
//
// ตัดสินใจแล้วว่า: คะแนนยังรีเซ็ตตามปกติทุกปีการศึกษาเหมือนเดิมทุกประการ (ไม่แตะ
// ตรรกะการนับคะแนนเลย) แค่ "ติดป้าย" ว่านักเรียนคนนี้เคยทำทัณฑ์บนมาก่อนไว้ถาวร
// ไม่ว่าจะขึ้นปีการศึกษาไปกี่รอบแล้วก็ตาม
//
// เก็บเป็นชีตแยกต่างหาก "Probation" (ไม่ผูกกับชีต Records) เพราะทัณฑ์บนเป็น
// "การกระทำทางปกครอง" ที่เจ้าหน้าที่ตัดสินใจทำจริง ไม่ใช่ผลที่คำนวณอัตโนมัติจาก
// คะแนนสะสมถึงเกณฑ์ (ถึงเกณฑ์แล้วก็ยังต้องมีคนเชิญผู้ปกครองมาเซ็นจริงๆ อยู่ดี) —
// เก็บเป็นประวัติสะสมทีละครั้ง (ไม่ใช่แค่ boolean เดียว) เผื่อนักเรียนคนเดียวทำ
// ทัณฑ์บนมากกว่า 1 ครั้งตลอดเวลาที่เรียนอยู่ที่นี่
// ==========================================

// รันครั้งเดียวจาก Apps Script Editor (เลือกฟังก์ชันนี้แล้วกด Run) เพื่อสร้างชีต
// "Probation" พร้อมหัวตาราง — ปลอดภัยที่จะรันซ้ำได้เสมอ (เช็กว่ามีชีตอยู่แล้วก่อน)
function setupProbationSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName("Probation")) {
    Logger.log("มีชีต Probation อยู่แล้ว ไม่ต้องสร้างซ้ำ");
    return;
  }
  const sheet = ss.insertSheet("Probation");
  sheet.appendRow(["เวลาที่บันทึก", "รหัสนักเรียน", "ชื่อ-นามสกุล", "วันที่ทำทัณฑ์บน", "บันทึกโดย", "หมายเหตุ", "รหัสรายการ"]);
  sheet.getRange(1, 1, 1, 7).setFontWeight("bold");
  Logger.log("สร้างชีต Probation เรียบร้อยแล้ว");
}

// รันครั้งเดียวจาก Apps Script Editor (เลือกฟังก์ชันนี้แล้วกด Run) เพื่อเติม
// "รหัสรายการ" (คอลัมน์ G) ให้แถวเก่าที่บันทึกไว้ก่อนมีคอลัมน์นี้ — ไม่งั้นแถวพวก
// นั้นจะแก้ไข/ลบผ่านหน้าเว็บไม่ได้ตลอดไป (ดูคำอธิบายที่ findProbationRowIndexById_
// ด้านล่าง) ปลอดภัยที่จะรันซ้ำได้เสมอ (ข้ามแถวที่มีรหัสอยู่แล้ว ไม่สร้างซ้ำ)
function backfillProbationIds_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Probation");
  if (!sheet) {
    Logger.log("ยังไม่มีชีต Probation — ไม่มีอะไรให้เติม");
    return;
  }
  const lastRow = sheet.getLastRow();
  let filled = 0;
  for (let row = 2; row <= lastRow; row++) {
    const cell = sheet.getRange(row, 7);
    if (String(cell.getValue() || '').trim()) continue; // มีรหัสอยู่แล้ว ข้าม
    cell.setValue(Utilities.getUuid());
    filled++;
  }
  invalidateProbationCache_();
  Logger.log('เติมรหัสรายการให้แถวเก่าเรียบร้อยแล้ว ' + filled + ' แถว');
}

// หาแถวจริงในชีต (เลขแถว 1-indexed) จาก "รหัสรายการ" คอลัมน์ G — ใช้กับทั้งแก้ไข
// และลบ สแกนหาใหม่ทุกครั้งที่เรียก (ไม่แคชเลขแถว) เพราะถ้าลบแถวอื่นไปก่อนหน้านี้
// เลขแถวของแถวที่เหลือจะเลื่อน แคชไว้แล้วจะผิดได้ — แบบเดียวกับ
// findRecordRowIndexById_ ใน Service_Records.gs (คนละไฟล์กัน หลักการเดียวกัน)
//
// ⚠️ แถวที่บันทึกไว้ "ก่อน" ที่จะมีคอลัมน์นี้ (ของเก่าก่อนอัปเดตฟีเจอร์แก้ไข/ลบ)
// จะไม่มีรหัสรายการเลย หาไม่เจอ แก้ไข/ลบผ่านหน้าเว็บไม่ได้ — รันฟังก์ชัน
// backfillProbationIds_() ด้านบนครั้งเดียวจาก Apps Script Editor เพื่อแก้ปัญหานี้
function findProbationRowIndexById_(sheet, id) {
  const idStr = String(id || '').trim();
  if (!idStr) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][6] || '') === idStr) return i + 1;
  }
  return null;
}

const PROBATION_CACHE_KEY = 'probation_by_student_v1';
const PROBATION_CACHE_TTL_SECONDS = 30;

function invalidateProbationCache_() {
  CacheService.getScriptCache().remove(PROBATION_CACHE_KEY);
}

// ==========================================
// บันทึกว่านักเรียนคนนี้ทำทัณฑ์บน — เฉพาะแอดมิน/กลุ่มเห็นทุกรายการ (งานปกครอง)
// ==========================================
function addProbationRecord(token, data) {
  const session = requireDisciplineStaff_(token);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Probation");
  if (!sheet) return { status: "error", message: "ยังไม่ได้ตั้งค่าชีต Probation — ผู้ดูแลระบบต้องรัน setupProbationSheet() ก่อน" };

  const studentId = String((data && data.studentId) || '').trim();
  if (!studentId) return { status: "error", message: "ไม่พบรหัสนักเรียน" };

  // 🔒 sanitizeForSheetCell_ (ดู Utils.gs) กันทุกช่องข้อความอิสระ (ชื่อ/วันที่/
  // หมายเหตุ) ใช้ตั้งสูตร Sheets ได้ — วันที่ต้องกันด้วยเหมือนกัน แม้ฝั่งเว็บจะจำกัด
  // ด้วย <input type="date"> ไว้แล้วก็ตาม เพราะมีคนเรียก action นี้ตรงๆ ข้าม UI
  // ได้เสมอถ้ามี token ที่ถูกต้อง (ห้ามเชื่อฝั่งเว็บฝ่ายเดียว — หลักการเดียวกับที่
  // ใช้กับ studentName/note อยู่แล้ว)
  // 🐛 เดิมเก็บ session.username (ชื่อบัญชีล็อกอิน เช่น "admin") ลงคอลัมน์นี้ตรงๆ
  // ไม่ตรงกับหน้า "รายงาน"/ประวัติตัดคะแนนที่โชว์ชื่อ-นามสกุลจริงของครู (คอลัมน์
  // teacherName ในชีต Records รับค่าจากฝั่งเว็บเหมือนกัน ดู addRecord ใน
  // Service_Records.gs) — ใช้ recordedByName ที่ฝั่งเว็บส่งมาแทน (ProbationModal.jsx
  // อ่านจาก currentUser ใน localStorage) fallback กลับไปที่ username ถ้าไม่มีมา
  // เผื่อเซสชันเก่า/เรียก API ตรงๆ ข้าม UI — session.username ยังใช้กับ logAudit
  // ด้านล่างเหมือนเดิมเพราะต้องอิงตัวตนที่ยืนยันแล้วจริงๆ ไม่ใช่ชื่อที่ฝั่งเว็บส่งมา
  sheet.appendRow([
    new Date().toISOString(),
    studentId,
    sanitizeForSheetCell_((data && data.studentName) || ''),
    sanitizeForSheetCell_((data && data.date) || ''),
    sanitizeForSheetCell_((data && data.recordedByName) || session.username),
    sanitizeForSheetCell_((data && data.note) || ''),
    Utilities.getUuid(),
  ]);
  invalidateProbationCache_();

  logAudit(session.username, "ADD_PROBATION", studentId, "SUCCESS");
  return { status: "success", message: "บันทึกทัณฑ์บนเรียบร้อยแล้ว" };
}

// ==========================================
// แก้ไขวันที่/หมายเหตุของรายการทัณฑ์บนที่มีอยู่แล้ว — สิทธิ์เดียวกับตอนเพิ่ม
// (แอดมิน/กลุ่มเห็นทุกรายการ) ไม่เปิดให้แก้ studentId/studentName/recordedBy
// เพราะถ้าบันทึกผิดคนไปเลย วิธีแก้ที่ถูกต้องคือลบทิ้งแล้วเพิ่มใหม่ ไม่ใช่ "ย้าย"
// รายการไปเป็นของนักเรียนคนอื่น (ป้องกันความสับสนของประวัติ)
// ==========================================
function updateProbationRecord(token, data) {
  const session = requireDisciplineStaff_(token);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Probation");
  if (!sheet) return { status: "error", message: "ยังไม่ได้ตั้งค่าชีต Probation" };

  const rowIndex = findProbationRowIndexById_(sheet, data && data.id);
  if (rowIndex === null) return { status: "error", message: "ไม่พบรายการที่ต้องการแก้ไข (อาจเป็นรายการเก่าก่อนมีฟีเจอร์นี้)" };

  sheet.getRange(rowIndex, 4).setValue(sanitizeForSheetCell_((data && data.date) || ''));
  sheet.getRange(rowIndex, 6).setValue(sanitizeForSheetCell_((data && data.note) || ''));
  invalidateProbationCache_();

  const studentId = String(sheet.getRange(rowIndex, 2).getValue() || '');
  logAudit(session.username, "UPDATE_PROBATION", studentId, "SUCCESS");
  return { status: "success", message: "แก้ไขข้อมูลทัณฑ์บนเรียบร้อยแล้ว" };
}

// ==========================================
// ลบรายการทัณฑ์บน — ลบแถวออกจากชีตจริง (ไม่ใช่ soft delete แบบชีต Records) เพราะ
// ฟีเจอร์นี้ไม่มีการ sync เข้า RMS/สร้าง PDF ผูกอยู่ด้วยเหมือนรายการตัดคะแนน ไม่มี
// ปมอะไรต้องรักษาไว้เทียบเคียง — การกระทำนี้ยังถูกบันทึกใน Audit_Logs ผ่าน
// logAudit ด้านล่างอยู่ดี ตรวจสอบย้อนหลังได้ว่าใครลบอะไรไปเมื่อไร
// ==========================================
function deleteProbationRecord(token, id) {
  const session = requireDisciplineStaff_(token);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Probation");
  if (!sheet) return { status: "error", message: "ยังไม่ได้ตั้งค่าชีต Probation" };

  const rowIndex = findProbationRowIndexById_(sheet, id);
  if (rowIndex === null) return { status: "error", message: "ไม่พบรายการที่ต้องการลบ (อาจเป็นรายการเก่าก่อนมีฟีเจอร์นี้)" };

  const studentId = String(sheet.getRange(rowIndex, 2).getValue() || '');
  sheet.deleteRow(rowIndex);
  invalidateProbationCache_();

  logAudit(session.username, "DELETE_PROBATION", studentId, "SUCCESS");
  return { status: "success", message: "ลบรายการทัณฑ์บนเรียบร้อยแล้ว" };
}

// ==========================================
// สร้าง map รหัสนักเรียน -> รายการทัณฑ์บนทั้งหมดของคนนั้น (เรียงล่าสุดก่อน) — แยก
// ออกมาจาก getProbationStatus() เดิม เพื่อให้ getRecords() (Service_Records.gs)
// เรียกใช้ตัวเดียวกันนี้ได้โดยตรง แนบผลลัพธ์ไปในคำตอบเดียวกันเลย แทนที่จะให้ฝั่ง
// เว็บต้องยิง action "getProbationStatus" แยกอีกรอบ — ก่อนหน้านี้ Dashboard.jsx/
// StudentProfile.jsx เรียกทั้ง getRecords และ getProbationStatus พร้อมกันทุกครั้ง
// ที่เปิดหน้า ทำให้ต้องรอ round-trip ไป Apps Script ถึง 2 รอบ (แต่ละรอบมีต้นทุน
// คงที่ราว 2 วินาทีต่อครั้งไม่ว่าข้อมูลจะเยอะแค่ไหนก็ตาม — ดูคอมเมนต์ใน api.js)
// ทั้งที่ข้อมูลทัณฑ์บนเองมีขนาดเล็กมาก รวมเป็นคำตอบเดียวตัดรอบที่ 2 ทิ้งไปได้เลย
// ==========================================
function getProbationByStudent_() {
  const cached = getChunkedCache_(PROBATION_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* อ่านแคชไม่ขึ้น อ่านจากชีตใหม่แทน */ }
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Probation");
  if (!sheet) return {};

  const data = sheet.getDataRange().getValues();
  const byStudent = {};
  for (let i = 1; i < data.length; i++) {
    const studentId = String(data[i][1] || '').trim();
    if (!studentId) continue;
    if (!byStudent[studentId]) byStudent[studentId] = [];
    // 🐛 เดิมทำ String(data[i][3]) ตรงๆ — Sheets แปลงสตริงที่หน้าตาเหมือนวันที่
    // ("2026-09-23") เป็นเซลล์ชนิด Date อัตโนมัติตอนเขียน พออ่านกลับมาได้ Date
    // object ไม่ใช่ string เดิม String(dateObject) เลยได้ข้อความยาวเฟะแบบ "Wed
    // Sep 23 2026 00:00:00 GMT+0700 ..." แทนวันที่อ่านง่าย — ใช้
    // formatThaiDate_ (Utils.gs) และ toIsoDateString_ (Service_Records.gs — คน
    // ละไฟล์กัน แต่ GAS มองเห็นกันหมดในโปรเจกต์เดียวอยู่แล้ว ไม่ต้อง import)
    // แบบเดียวกับ mapRowToRecord_ ใน Service_Records.gs แทน (รองรับทั้ง Date
    // object และ string อยู่แล้ว)
    const rawDate = data[i][3];
    byStudent[studentId].push({
      // 🆕 id (คอลัมน์ G) — ใช้กับปุ่มแก้ไข/ลบฝั่งเว็บ (ดู findProbationRowIndexById_
      // ด้านบน) แถวเก่าก่อนมีคอลัมน์นี้จะได้ '' ว่างไป ฝั่งเว็บซ่อนปุ่มแก้ไข/ลบให้
      // อัตโนมัติเมื่อไม่มี id (ดู StudentProfile.jsx)
      id: String(data[i][6] || ''),
      date: rawDate ? toIsoDateString_(rawDate) : '',
      displayDate: formatThaiDate_(rawDate),
      recordedBy: String(data[i][4] || ''),
      note: String(data[i][5] || ''),
    });
  }
  // ล่าสุดขึ้นก่อนในแต่ละคน (แถวในชีตเรียงจากเก่าไปใหม่ตามธรรมชาติของ appendRow)
  Object.keys(byStudent).forEach((id) => byStudent[id].reverse());

  putChunkedCache_(PROBATION_CACHE_KEY, JSON.stringify(byStudent), PROBATION_CACHE_TTL_SECONDS);

  return byStudent;
}

// เปิดให้เรียกแยกได้เองด้วย (ใช้ตอนแก้ไข/ลบ/เพิ่มทัณฑ์บนแล้วอยากรีเฟรชป้ายทันที
// โดยไม่ต้องโหลดรายการตัดคะแนนทั้งหมดซ้ำ — ดู onSaved ใน Dashboard.jsx/
// StudentProfile.jsx) เปิดให้ผู้ใช้งานที่ login แล้วทุกคนเรียกได้ (ไม่ใช่แค่งาน
// ปกครอง) เพราะแค่ "ดู" ป้ายนี้ในหน้าประวัตินักเรียน ไม่ใช่ข้อมูลอ่อนไหวเท่าการ
// บันทึกทัณฑ์บนใหม่ (ซึ่งจำกัดสิทธิ์ผ่าน addProbationRecord แล้ว)
function getProbationStatus(token) {
  requireSession(token);
  return { status: "success", data: getProbationByStudent_() };
}
