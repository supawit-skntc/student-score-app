// ==========================================
// ไฟล์ Service_Ops.gs : งานด้านความเสถียรและความปลอดภัยของระบบโดยรวม ไม่ผูกกับ
// ฟีเจอร์ใดฟีเจอร์หนึ่งโดยเฉพาะ (ต่างจาก Service_Records/Service_Users ที่ผูกกับ
// ข้อมูลชุดใดชุดหนึ่ง) — แบ่งเป็น 3 เรื่อง: แจ้งเตือนเมื่อเกิด error, จำกัดอัตรา
// การเรียก API ต่อ session (กันโดนโจมตี/ใช้งานผิดปกติ), และสำรองข้อมูลอัตโนมัติ
// ==========================================

// ==========================================
// 1. 🚨 แจ้งเตือนผู้ดูแลระบบทางอีเมลเมื่อเซิร์ฟเวอร์เกิดข้อผิดพลาดที่ไม่คาดคิด
// เรียกจาก catch block ของ doPost() ใน Main.gs — เดิมถ้าเกิด error ฝั่ง server
// (เช่น เข้าถึงชีต/Drive ไม่ได้ชั่วคราว, โค้ดพัง) จะไม่มีใครรู้เลยจนกว่าจะมีครูมา
// แจ้งว่าใช้งานไม่ได้ ฟังก์ชันนี้ทำให้ผู้ดูแลระบบรู้ก่อนที่จะมีคนมาบ่น
//
// ⚠️ กรองข้อผิดพลาด "ที่คาดไว้แล้วเป็นปกติของระบบ" ออกก่อนเสมอ (เซสชันหมดอายุ,
// ไม่มีสิทธิ์เข้าถึง) เพราะเกิดขึ้นบ่อยเป็นเรื่องปกติของการใช้งานทั่วไป ไม่ใช่บั๊ก
// ถ้าไม่กรองออกจะส่งอีเมลรัวๆ จนกล่องเมล์ท่วมและกลบ error จริงที่ควรสนใจ
//
// มีตัวกันสแปมอีกชั้น (cooldown) — ถ้า error เกิดรัวๆ ติดกัน (เช่น โควตา Google
// หมดชั่วคราวทำให้ทุก request พังหมด) จะส่งอีเมลแค่ 1 ฉบับต่อ 10 นาทีเท่านั้น
// ==========================================
const ERROR_ALERT_COOLDOWN_SECONDS = 600;
const ERROR_ALERT_COOLDOWN_CACHE_KEY = 'error_alert_cooldown_v1';

function notifyAdminOfError_(err, context) {
  try {
    if (!CONFIG.ADMIN_ALERT_EMAIL) return; // ยังไม่ได้ตั้งอีเมลผู้รับ — ปิดฟีเจอร์นี้เงียบๆ

    const message = (err && err.message) ? err.message : String(err);

    // ข้อผิดพลาดที่เป็นเรื่องปกติของการใช้งาน (ไม่ใช่สัญญาณของบั๊ก) — ข้ามไป ไม่ต้องแจ้งเตือน
    if (message.indexOf('เซสชันหมดอายุ') !== -1 || message.indexOf('ไม่มีสิทธิ์เข้าถึง') !== -1) return;

    const cache = CacheService.getScriptCache();
    if (cache.get(ERROR_ALERT_COOLDOWN_CACHE_KEY)) return; // เพิ่งส่งไปเมื่อครู่ ยังอยู่ในช่วงกันสแปม
    cache.put(ERROR_ALERT_COOLDOWN_CACHE_KEY, '1', ERROR_ALERT_COOLDOWN_SECONDS);

    const subject = '[ระบบตัดคะแนนความประพฤติ] พบข้อผิดพลาดที่เซิร์ฟเวอร์';
    const body = [
      'เกิดข้อผิดพลาดที่ไม่คาดคิดในระบบตัดคะแนนความประพฤติ',
      '',
      'เวลา: ' + new Date().toISOString(),
      'Action: ' + (context && context.action ? context.action : '(ไม่ทราบ)'),
      'ข้อความ error: ' + message,
      '',
      'หมายเหตุ: อีเมลลักษณะนี้จะส่งได้ไม่เกิน 1 ฉบับทุก 10 นาที ถ้า error เกิดถี่กว่านั้น',
      'จะไม่ได้รับอีเมลซ้ำทุกครั้ง — กรุณาตรวจสอบที่ Apps Script Editor > Executions',
      'เพื่อดูรายละเอียด/ความถี่ที่แท้จริงเพิ่มเติม',
    ].join('\n');

    MailApp.sendEmail(CONFIG.ADMIN_ALERT_EMAIL, subject, body);
  } catch (notifyErr) {
    // การแจ้งเตือนพังไม่ควรทำให้ request เดิมที่กำลังตอบ error กลับไปอยู่แล้วพังซ้ำ
    console.error('ส่งอีเมลแจ้งเตือนผู้ดูแลระบบไม่สำเร็จ: ' + notifyErr);
  }
}

// ==========================================
// 2. 🛡️ จำกัดอัตราการเรียก API ต่อ session token — กันกรณี token หลุด/ถูกขโมย
// แล้วมีคนยิง request รัวๆ (หรือโค้ดฝั่งไหนมีบั๊กวนลูปเรียกซ้ำไม่หยุด) ไม่ให้ไป
// ใช้โควตาของ Google Apps Script (ต่อวัน/ต่อผู้ใช้) จนกระทบผู้ใช้งานคนอื่นทั้งระบบ
//
// เรียกจาก requireSession() ใน Utils.gs ซึ่งเป็นจุดเดียวที่ทุก action (ยกเว้น
// login) ต้องผ่านอยู่แล้ว จึงครอบคลุมทุก endpoint โดยอัตโนมัติโดยไม่ต้องไปเพิ่ม
// ทีละจุด — ขีดจำกัดตั้งไว้สูงพอสำหรับการใช้งานจริงของทั้งครู (กดปุ่มในหน้าเว็บ)
// และบอท RPA (ประมวลผลคิวหลายรายการติดกัน) แต่กันการยิงรัวผิดปกติได้
// ==========================================
const RATE_LIMIT_MAX_PER_MINUTE = 120;

function checkRateLimit_(token) {
  if (!token) return; // ไม่มี token ผ่านไม่ได้อยู่แล้วจาก requireSession ที่เรียกก่อนหน้า
  const cache = CacheService.getScriptCache();
  const windowId = Math.floor(Date.now() / 60000); // แบ่งเป็นช่วงละ 1 นาที
  const key = 'rl_' + token + '_' + windowId;
  const current = parseInt(cache.get(key) || '0', 10);

  if (current >= RATE_LIMIT_MAX_PER_MINUTE) {
    throw new Error('คำขอถี่เกินไป กรุณาลองใหม่อีกครั้งในอีกสักครู่');
  }

  cache.put(key, String(current + 1), 65); // เผื่อเวลาข้ามรอยต่อของแต่ละนาทีเล็กน้อย
}

// ==========================================
// 3. 💾 สำรองข้อมูลอัตโนมัติ — ชีต Records/Users เป็นข้อมูลสำคัญที่สุดในระบบ
// (ประวัติวินัยนักเรียน + บัญชีผู้ใช้งานทั้งหมด) Google Sheets มี Version History
// ให้อยู่แล้วก็จริง แต่เป็นแบบ "กู้ทั้งไฟล์กลับไปเวอร์ชันเก่า" เท่านั้น ถ้าอยาก
// เก็บสำเนาแยกไว้ต่างหาก (กู้เฉพาะบางส่วน/เผื่อไฟล์หลักมีปัญหา) ต้อง export เอง
//
// รันอัตโนมัติทุกวันผ่าน time-based trigger (ตั้งครั้งเดียวด้วย
// setupDailyBackupTrigger() ด้านล่าง) — เก็บเป็นไฟล์ CSV แยกตามวันที่ ในโฟลเดอร์
// "ระบบตัดคะแนน_Backups" บน Drive (สร้างให้อัตโนมัติถ้ายังไม่มี ไม่ต้องตั้งค่า
// Folder ID เอง) และลบไฟล์เก่าที่เกิน 30 วันทิ้งอัตโนมัติ กันไฟล์สะสมไม่มีที่สิ้นสุด
// ==========================================
const BACKUP_FOLDER_NAME = 'ระบบตัดคะแนน_Backups';
const BACKUP_RETENTION_DAYS = 30;
// สำรองเฉพาะ Records — ชีต Users มีแค่ไม่กี่บัญชีสร้างใหม่ได้เร็ว และไฟล์สำรองจะมีค่า
// Password_Hash/Salt ของทุกคนติดไปด้วย (เสี่ยงกว่าประโยชน์ที่ได้) จึงไม่สำรองชีตนี้
const BACKUP_SHEET_NAMES = ['Records'];

function getOrCreateBackupFolder_() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

function sheetToCsv_(sheet) {
  const data = sheet.getDataRange().getValues();
  return data.map((row) => row.map((cell) => {
    const text = (cell === null || cell === undefined) ? '' : String(cell);
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(',')).join('\n');
}

// รันทุกวันผ่าน trigger (ดู setupDailyBackupTrigger) — export เต็มทุกแถวรวมถึง
// รายการที่ถูก soft-delete ไปแล้วด้วย (ต่างจาก readActiveRecordRows_ ที่กรองออก)
// เพราะจุดประสงค์ของ backup คือเก็บสภาพข้อมูลจริงไว้ทั้งหมดเผื่อต้องกู้คืน
function backupRecordsToArchive_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const folder = getOrCreateBackupFolder_();
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyyMMdd_HHmmss');

  BACKUP_SHEET_NAMES.forEach((sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return; // ไม่มีชีตนี้ (ยังไม่เคยสร้าง) — ข้ามไปเงียบๆ
    const csv = sheetToCsv_(sheet);
    folder.createFile(sheetName + '_backup_' + timestamp + '.csv', csv, MimeType.CSV);
  });

  cleanupOldBackups_(folder);
}

function cleanupOldBackups_(folder) {
  const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getDateCreated() < cutoff) {
      file.setTrashed(true);
    }
  }
}

// ==========================================
// 4. รันครั้งเดียวจาก Apps Script Editor (เลือกฟังก์ชันนี้แล้วกด Run) เพื่อตั้ง
// เวลาให้ backupRecordsToArchive_() รันอัตโนมัติทุกวัน — ลบ trigger เดิมของ
// ฟังก์ชันนี้ก่อนเสมอ กันสร้างซ้ำซ้อนถ้าเผลอรันฟังก์ชัน setup นี้มากกว่า 1 ครั้ง
// ==========================================
function setupDailyBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'backupRecordsToArchive_') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('backupRecordsToArchive_')
    .timeBased()
    .everyDays(1)
    .atHour(2) // ตีสอง — ช่วงเวลาที่แทบไม่มีใครใช้งานระบบ
    .create();

  Logger.log('ตั้งเวลาสำรองข้อมูลอัตโนมัติทุกวันประมาณ 02:00 น. เรียบร้อยแล้ว (เก็บย้อนหลัง ' + BACKUP_RETENTION_DAYS + ' วัน)');
}
