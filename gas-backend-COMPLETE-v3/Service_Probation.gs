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
  sheet.appendRow(["เวลาที่บันทึก", "รหัสนักเรียน", "ชื่อ-นามสกุล", "วันที่ทำทัณฑ์บน", "บันทึกโดย", "หมายเหตุ"]);
  sheet.getRange(1, 1, 1, 6).setFontWeight("bold");
  Logger.log("สร้างชีต Probation เรียบร้อยแล้ว");
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

  // 🔒 sanitizeForSheetCell_ (ดู Utils.gs) กันช่องหมายเหตุ/ชื่อ ใช้ตั้งสูตร Sheets ได้
  sheet.appendRow([
    new Date().toISOString(),
    studentId,
    sanitizeForSheetCell_((data && data.studentName) || ''),
    (data && data.date) || '',
    session.username,
    sanitizeForSheetCell_((data && data.note) || ''),
  ]);
  invalidateProbationCache_();

  logAudit(session.username, "ADD_PROBATION", studentId, "SUCCESS");
  return { status: "success", message: "บันทึกทัณฑ์บนเรียบร้อยแล้ว" };
}

// ==========================================
// ส่งประวัติทัณฑ์บนของทุกคนกลับไปให้เว็บครั้งเดียว (map รหัสนักเรียน -> รายการ
// ทัณฑ์บนทั้งหมดของคนนั้น เรียงล่าสุดก่อน) แทนที่จะให้เว็บมาถามทีละคน — ข้อมูลนี้
// ไม่เยอะ (นักเรียนส่วนน้อยเท่านั้นที่ทำทัณฑ์บน) เปิดให้ผู้ใช้งานที่ login แล้วทุก
// คนเรียกได้ (ไม่ใช่แค่งานปกครอง) เพราะแค่ "ดู" ป้ายนี้ในหน้าประวัตินักเรียน ไม่ใช่
// ข้อมูลอ่อนไหวเท่าการบันทึกทัณฑ์บนใหม่ (ซึ่งจำกัดสิทธิ์ผ่าน addProbationRecord แล้ว)
// ==========================================
function getProbationStatus(token) {
  requireSession(token);

  const cache = CacheService.getScriptCache();
  const cached = cache.get(PROBATION_CACHE_KEY);
  if (cached) {
    try { return { status: "success", data: JSON.parse(cached) }; } catch (e) { /* อ่านแคชไม่ขึ้น อ่านจากชีตใหม่แทน */ }
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Probation");
  if (!sheet) return { status: "success", data: {} };

  const data = sheet.getDataRange().getValues();
  const byStudent = {};
  for (let i = 1; i < data.length; i++) {
    const studentId = String(data[i][1] || '').trim();
    if (!studentId) continue;
    if (!byStudent[studentId]) byStudent[studentId] = [];
    byStudent[studentId].push({
      date: String(data[i][3] || ''),
      recordedBy: String(data[i][4] || ''),
      note: String(data[i][5] || ''),
    });
  }
  // ล่าสุดขึ้นก่อนในแต่ละคน (แถวในชีตเรียงจากเก่าไปใหม่ตามธรรมชาติของ appendRow)
  Object.keys(byStudent).forEach((id) => byStudent[id].reverse());

  try {
    const serialized = JSON.stringify(byStudent);
    if (serialized.length < 95000) cache.put(PROBATION_CACHE_KEY, serialized, PROBATION_CACHE_TTL_SECONDS);
  } catch (e) { /* แคชพังไม่ควรทำให้ฟังก์ชันหลักพังตาม */ }

  return { status: "success", data: byStudent };
}
