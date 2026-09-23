// ==========================================
// ไฟล์ Service_Users.gs : จัดการผู้ใช้งานระบบ
// ทุกฟังก์ชันในไฟล์นี้เป็นสิทธิ์ผู้ดูแลระบบ (Admin) เท่านั้น (requireAdmin() จะ
// โยน error ทันทีถ้าผู้เรียกไม่ใช่ admin หรือไม่ได้ login) ยกเว้น getStaffEmails_()
// ด้านล่างซึ่งเป็น helper ภายในล้วนๆ ไม่มี token — ดูคำอธิบายที่ฟังก์ชันนั้น
// ==========================================

// ==========================================
// 🔒 รายชื่ออีเมลบุคลากรทั้งหมดที่มีในชีต Users (คอลัมน์ F) — ใช้แชร์ไฟล์ PDF
// บันทึกตัดคะแนนให้เฉพาะบุคลากรที่มีบัญชีในระบบนี้จริง (ดู generatePDF() ใน
// Service_PDF.gs) แทนการแชร์ "ทั้งโดเมน Google Workspace" แบบเดิม ซึ่งพบว่า
// นักเรียนบางคนก็อยู่โดเมนเดียวกันด้วย (ยืนยันจากผู้ใช้งานแล้ว) ทำให้นักเรียนที่
// ได้ลิงก์ PDF มาไม่ว่าทางใดก็ตาม เปิดดูประวัติวินัยของเพื่อนได้ทั้งที่ไม่ควรมี
// สิทธิ์เข้าถึงเลย
//
// ⚠️ ผลกระทบสำคัญ: บุคลากรที่ยังไม่เคยกรอกอีเมลไว้ในหน้า "จัดการผู้ใช้งาน" (คอลัมน์
// Email เป็นฟีเจอร์เสริมที่เพิ่งเพิ่มทีหลัง หลายบัญชีเก่าอาจยังว่างอยู่) จะเปิดลิงก์
// PDF ไม่ได้อีกต่อไปหลัง deploy นี้ ควรตรวจสอบ/เติมอีเมลให้ครบทุกบัญชีที่ยังใช้งาน
// อยู่ผ่านหน้าจัดการผู้ใช้งานก่อน
//
// แคชไว้ 10 นาที (ชีต Users ไม่ค่อยเปลี่ยนบ่อย) กัน generatePDF() ที่เรียกถี่ต้อง
// อ่านทั้งชีต Users ใหม่ทุกครั้ง
// ==========================================
const STAFF_EMAILS_CACHE_KEY = 'staff_emails_v1';
const STAFF_EMAILS_CACHE_TTL_SECONDS = 600;

function getStaffEmails_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(STAFF_EMAILS_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* แคชอ่านไม่ขึ้น อ่านจากชีตใหม่แทน */ }
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const emails = [];
  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][5] || '').trim();
    // เช็กแบบง่ายๆ พอ (มี @ และไม่มีช่องว่าง) กันแถวที่กรอกผิด/พิมพ์ข้อความมั่ว
    // ทำให้ addViewers() ทั้งก้อนล้มเหลวไปทั้งหมดเพราะอีเมลเดียวผิดรูปแบบ
    if (email && email.indexOf('@') !== -1 && email.indexOf(' ') === -1) {
      emails.push(email);
    }
  }

  try {
    cache.put(STAFF_EMAILS_CACHE_KEY, JSON.stringify(emails), STAFF_EMAILS_CACHE_TTL_SECONDS);
  } catch (e) { /* แคชพังไม่ควรทำให้ฟังก์ชันหลักพังตาม */ }

  return emails;
}

// เรียกทันทีหลังเพิ่ม/แก้ไขอีเมลผู้ใช้งานสำเร็จ กันไม่ให้ PDF ที่สร้างในช่วง 10
// นาทีถัดมายังใช้รายชื่ออีเมลเก่าที่ค้างอยู่ในแคช (เดิมไม่มีจุดนี้เพราะไม่เคยมี
// การแคชรายชื่ออีเมลมาก่อน)
function invalidateStaffEmailsCache_() {
  CacheService.getScriptCache().remove(STAFF_EMAILS_CACHE_KEY);
}

function getUsersList(token) {
  requireAdmin(token);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) return { status: "error", message: "ไม่พบฐานข้อมูลผู้ใช้งาน" };

  const data = sheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    users.push({
      username: String(data[i][0]).trim(),
      fullName: String(data[i][2]).trim(),
      role: String(data[i][3]).trim()
      // ⚠️ ห้ามส่ง Password_Hash (คอลัมน์ B) กลับไปฝั่ง client เด็ดขาด
    });
  }
  return { status: "success", data: users };
}

// ==========================================
// ส่ง role→tier ('admin' | 'full') ทั้งก้อนให้หน้า "จัดการผู้ใช้งาน" ใช้จัดหมวด
// บัญชีคนอื่น (เช่น badge ในตาราง, คำอธิบายตอนเลือก role ในฟอร์ม) — ต่างจาก
// roleTier ที่แนบมากับ user ตอน login (เฉพาะของตัวเอง) เพราะหน้านี้ต้องจัดหมวด
// role ของ "คนอื่น"/role ที่ยังไม่ถูกเลือกจริงด้วย ดู roleTierOf_/
// buildRoleTierMap_ ใน Utils.gs — เจ้าของข้อมูลจริงที่เดียว ไม่ต้องเก็บรายชื่อ
// ADMIN_ROLES/FULL_VISIBILITY_ROLES ซ้ำฝั่งเว็บอีกต่อไป (เดิมอยู่ที่
// src/utils/permissions.js)
// ==========================================
function getRoleTiers(token) {
  requireAdmin(token);
  return { status: "success", data: buildRoleTierMap_() };
}

function createUser(token, newUserData) {
  requireAdmin(token);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) return { status: "error", message: "ไม่พบฐานข้อมูลผู้ใช้งาน" };

  const username = String(newUserData.username || '').trim();
  if (!username) return { status: "error", message: "กรุณาระบุชื่อผู้ใช้งาน" };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === username) {
      return { status: "error", message: "มีชื่อผู้ใช้งานนี้อยู่แล้ว" };
    }
  }

  if (!newUserData.password || String(newUserData.password).length < 8) {
    return { status: "error", message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" };
  }

  const salt = generateSalt();
  const saltedHash = hashPassword(String(newUserData.password).trim(), salt);
  // เขียนคอลัมน์ E (Salt) ด้วยเสมอสำหรับบัญชีใหม่ทุกบัญชี — ปลอดภัยกว่าบัญชีเก่า
  // ที่ยังไม่มี salt (ดูคำอธิบายที่ hashPassword() ใน Utils.gs)
  // 🆕 คอลัมน์ F (Email) — เก็บไว้ให้ผู้ดูแลระบบเอาไปเพิ่มสิทธิ์ดูเอกสารใน Google
  // Drive เองภายหลัง (ดูตรงชีต Users โดยตรง) ไม่ได้ส่งกลับไปแสดงในหน้าเว็บเลย
  // 🔒 sanitizeForSheetCell_ (ดู Utils.gs) กันช่องชื่อ-นามสกุลใช้ตั้งสูตร Sheets
  // ได้ — ความเสี่ยงต่ำกว่าฝั่ง Records เพราะหน้านี้ admin เท่านั้นที่เขียนถึง แต่
  // ทำไว้เผื่อบัญชี admin ถูกขโมย/ใช้งานผิดพลาด ต้นทุนแทบเป็นศูนย์
  sheet.appendRow([username, saltedHash, sanitizeForSheetCell_(newUserData.fullName || ''), newUserData.role || '', salt, newUserData.email || '']);
  invalidateStaffEmailsCache_();

  logAudit(getSession(token).username, "CREATE_USER", username, "SUCCESS");
  return { status: "success", message: "เพิ่มผู้ใช้งานสำเร็จ" };
}

function updateUser(token, updatedData) {
  const session = requireAdmin(token);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) return { status: "error", message: "ไม่พบฐานข้อมูลผู้ใช้งาน" };

  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(updatedData.username).trim()) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex === -1) return { status: "error", message: "ไม่พบผู้ใช้งานนี้" };

  sheet.getRange(rowIndex, 3).setValue(sanitizeForSheetCell_(updatedData.fullName || ''));
  sheet.getRange(rowIndex, 4).setValue(updatedData.role || '');

  // อีเมลไม่ถูกส่งกลับมาแสดงในฟอร์มแก้ไข (getUsersList ไม่คืนค่านี้ไปให้เว็บเลย)
  // ดังนั้นถ้าช่องว่างเปล่าตอนบันทึก แปลว่า "ไม่ได้ตั้งใจแก้" ไม่ใช่ "ต้องการลบ
  // อีเมลเดิมทิ้ง" จึงเขียนทับเฉพาะตอนมีค่าจริงส่งมาเท่านั้น กันข้อมูลหายโดยไม่ตั้งใจ
  if (updatedData.email) {
    sheet.getRange(rowIndex, 6).setValue(updatedData.email);
    invalidateStaffEmailsCache_();
  }

  if (updatedData.password) {
    if (String(updatedData.password).length < 8) {
      return { status: "error", message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร" };
    }
    // รีเซ็ตรหัสผ่านทีไร ก็สุ่ม salt ใหม่ให้เลย — เป็นจังหวะธรรมชาติที่จะอัปเกรด
    // บัญชีเก่า (ที่ยังไม่มี salt มาก่อน) ให้มี salt ไปในตัวโดยไม่ต้องทำอะไรพิเศษ
    const salt = generateSalt();
    sheet.getRange(rowIndex, 2).setValue(hashPassword(String(updatedData.password).trim(), salt));
    sheet.getRange(rowIndex, 5).setValue(salt);
  }

  logAudit(session.username, "UPDATE_USER", updatedData.username, "SUCCESS");
  return { status: "success", message: "อัปเดตข้อมูลผู้ใช้งานสำเร็จ" };
}

function deleteUser(token, username) {
  const session = requireAdmin(token);

  // กันลบบัญชีตัวเอง ป้องกันการล็อกตัวเองออกจากระบบโดยไม่ตั้งใจ
  if (session.username === username) {
    return { status: "error", message: "ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้" };
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) return { status: "error", message: "ไม่พบฐานข้อมูลผู้ใช้งาน" };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(username).trim()) {
      sheet.deleteRow(i + 1);
      // 🔒 ล้างแคชอีเมลบุคลากรทันที (ดู getStaffEmails_ ด้านบน) — เดิมจุดนี้ไม่มี
      // ทำให้ถ้าบัญชีที่เพิ่งลบมีอีเมลอยู่ในระบบ PDF ที่สร้างขึ้นภายใน 10 นาทีถัด
      // มายังจะแชร์ให้บัญชีที่เพิ่งลบไปแล้วอยู่ดี (แคชเก่ายังไม่หมดอายุ)
      invalidateStaffEmailsCache_();
      logAudit(session.username, "DELETE_USER", username, "SUCCESS");
      return { status: "success", message: "ลบผู้ใช้งานสำเร็จ" };
    }
  }
  return { status: "error", message: "ไม่พบผู้ใช้งานนี้" };
}

// ==========================================
// รันครั้งเดียวจาก Apps Script Editor (เลือกฟังก์ชันนี้แล้วกด Run) เพื่อเพิ่ม
// หัวตารางคอลัมน์ E "Salt" ในชีต Users ถ้ายังไม่มี — ไม่กระทบบัญชีเก่าที่มีอยู่แล้ว
// (ยังว่างไว้ก่อน จะได้ salt ให้อัตโนมัติตอนถูกรีเซ็ตรหัสผ่านครั้งถัดไป)
// ==========================================
function setupSaltColumn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) throw new Error("ไม่พบแผ่นงาน Users");

  const header = sheet.getRange(1, 5).getValue();
  if (!header) {
    sheet.getRange(1, 5).setValue("Salt");
  }
  Logger.log("ตั้งค่าคอลัมน์ Salt เรียบร้อยแล้ว");
}

// ==========================================
// รันครั้งเดียวจาก Apps Script Editor เช่นกัน เพื่อเตรียมคอลัมน์ F (Email)
// สำหรับฟีเจอร์ "เก็บอีเมลผู้ใช้งาน" (ใช้เพิ่มสิทธิ์ Google Drive ภายหลัง)
// ==========================================
function setupEmailColumn() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");
  if (!sheet) throw new Error("ไม่พบแผ่นงาน Users");

  const header = sheet.getRange(1, 6).getValue();
  if (!header) {
    sheet.getRange(1, 6).setValue("Email");
  }
  Logger.log("ตั้งค่าคอลัมน์ Email เรียบร้อยแล้ว");
}
