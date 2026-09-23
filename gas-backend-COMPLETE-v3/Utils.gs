// แปลงวันที่ (Date object จาก Sheets หรือ string ก็ได้) ให้เป็นข้อความไทยอ่านง่าย
// เช่น "23 ก.ย. 2569" (หรือ "23 กันยายน 2569" ถ้าส่ง {long:true} — เอกสาร PDF
// ใช้ชื่อเดือนเต็ม ส่วน badge/รายการในเว็บใช้ชื่อย่อ) — ใช้ร่วมกันทุกจุดที่ต้อง
// แสดงวันที่เป็นภาษาไทย (mapRowToRecord_ ใน Service_Records.gs, getProbationStatus
// ใน Service_Probation.gs, generatePDF ใน Service_PDF.gs) กันเขียนอาร์เรย์ชื่อ
// เดือนไทยซ้ำหลายจุด (เคยมีสำเนาแยกอยู่ใน Service_PDF.gs เอง) และกันบั๊กคลาสสิก
// ของ Sheets: เขียนสตริงที่หน้าตาเหมือนวันที่ลงเซลล์ (เช่น "2026-09-23") แล้ว
// Sheets แปลงเป็นเซลล์ชนิด Date ให้อัตโนมัติเอง พออ่านกลับมาผ่าน getValues() จะ
// ได้ JS Date object ไม่ใช่ string เดิม — ถ้าใครเผลอทำ String(dateObject) ตรงๆ
// จะได้ข้อความยาวเฟะแบบ "Wed Sep 23 2026 00:00:00 GMT+0700 (Indochina Time)"
// แทนวันที่อ่านง่าย (เจอบั๊กนี้จริงในชีต Probation)
// อาร์เรย์ชื่อเดือนอยู่ระดับไฟล์ (สร้างครั้งเดียวตอนโหลด) — เดิมสร้างใหม่ทุกครั้ง
// ที่เรียกฟังก์ชันนี้ ซึ่ง mapRowToRecord_ เรียกต่อ 1 แถว
const THAI_MONTHS_SHORT_ = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THAI_MONTHS_LONG_ = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function formatThaiDate_(rawDate, options) {
  if (!rawDate) return "";
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return String(rawDate);
  const months = (options && options.long) ? THAI_MONTHS_LONG_ : THAI_MONTHS_SHORT_;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// ==========================================
// 🗃️ แคชข้อมูลก้อนใหญ่แบบแบ่งเป็นหลายชิ้น — CacheService รับได้ ~100KB ต่อ 1 คีย์
// ซึ่งนับเป็น "ไบต์" (ภาษาไทย 1 ตัวอักษร = 3 ไบต์) แต่โค้ดเดิมเช็กเพดานด้วยจำนวน
// "ตัวอักษร" (< 95000) ทำให้ข้อมูลรายการตัดคะแนนที่วัดจริงได้ราว 566 ไบต์/แถว เต็ม
// เพดานที่ประมาณ 180 แถว แล้ว cache.put พังเงียบๆ (โดน catch กลืน) ทุกคำขอต้อง
// อ่านทั้งชีตใหม่โดยไม่มีสัญญาณเตือน — ตัวช่วยนี้แบ่งข้อมูลเป็นชิ้นละ 30000 ตัวอักษร
// (สูงสุด ~90KB ต่อชิ้นแม้เป็นภาษาไทยล้วน) ได้สูงสุด 20 ชิ้น (~1,500 แถว) เกินกว่านั้น
// คืน false ให้ผู้เรียกข้ามการแคชเหมือนเดิม
//
// ชิ้นแรกเก็บไว้ที่คีย์หลักพร้อมหัว "รหัสรุ่น|จำนวนชิ้น|" ส่วนชิ้นที่ 2 เป็นต้นไปใช้
// คีย์ที่มีรหัสรุ่นต่อท้าย — ข้อมูลเล็กกว่า 30000 ตัวอักษรใช้ 1 RPC เท่าเดิม และการล้าง
// แคช (cache.remove(key)) ทำที่คีย์หลักอย่างเดียวก็ครบ ชิ้นที่เหลือกลายเป็นของ
// กำพร้าหมดอายุเองตาม TTL รหัสรุ่นกันเอาชิ้นจากคนละรุ่นมาต่อกันผิดๆ ถ้ามี 2 คำขอ
// เขียนแคชชนกัน
// ==========================================
const CHUNK_CACHE_CHARS_ = 30000;
const CHUNK_CACHE_MAX_CHUNKS_ = 20;

function putChunkedCache_(key, str, ttlSeconds) {
  try {
    const n = Math.max(1, Math.ceil(str.length / CHUNK_CACHE_CHARS_));
    if (n > CHUNK_CACHE_MAX_CHUNKS_) return false;
    const gen = Utilities.getUuid().slice(0, 8);
    const entries = {};
    entries[key] = gen + '|' + n + '|' + str.slice(0, CHUNK_CACHE_CHARS_);
    for (let i = 1; i < n; i++) {
      entries[key + '_' + gen + '_' + i] = str.slice(i * CHUNK_CACHE_CHARS_, (i + 1) * CHUNK_CACHE_CHARS_);
    }
    CacheService.getScriptCache().putAll(entries, ttlSeconds);
    return true;
  } catch (e) {
    return false; // แคชพังไม่ควรทำให้ฟังก์ชันหลักพังตาม
  }
}

// คืนสตริงเต็มที่เคยเก็บไว้ หรือ null ถ้าไม่มี/ชิ้นใดชิ้นหนึ่งหมดอายุไปก่อน
function getChunkedCache_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const head = cache.get(key);
    if (!head) return null;
    const p1 = head.indexOf('|');
    const p2 = head.indexOf('|', p1 + 1);
    if (p1 < 0 || p2 < 0) return null;
    const gen = head.slice(0, p1);
    const n = parseInt(head.slice(p1 + 1, p2), 10);
    const first = head.slice(p2 + 1);
    if (n <= 1) return first;

    const keys = [];
    for (let i = 1; i < n; i++) keys.push(key + '_' + gen + '_' + i);
    const rest = cache.getAll(keys);
    const parts = [first];
    for (let i = 0; i < keys.length; i++) {
      if (rest[keys[i]] == null) return null;
      parts.push(rest[keys[i]]);
    }
    return parts.join('');
  } catch (e) {
    return null;
  }
}

function logAudit(user, action, targetId, status) {
  try {
    // getActiveSpreadsheet() (ชีตเดียวกับที่ handler ส่วนใหญ่เปิดอยู่แล้วก่อนเรียกมาถึงที่นี่)
    // แทน openById(CONFIG.SPREADSHEET_ID) ที่ต้องเปิดไฟล์ใหม่อีกรอบทุกครั้งที่เขียน
    // audit — logAudit ถูกเรียกท้ายทุก action เขียนข้อมูล (ลบ/แก้ไข/เพิ่ม) จึงเป็น
    // ต้นทุนที่ต่อท้ายทุกครั้ง ผลเป็นชีตเดียวกันเสมอเพราะ CONFIG.SPREADSHEET_ID
    // ก็มาจาก getActiveSpreadsheet() อยู่แล้ว (ดู Config.gs)
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Audit_Logs");
    sheet.appendRow([new Date().toISOString(), user, action, targetId, status]);
    // 🔄 ล้างแคช getAuditLogs() ทันที (ดูด้านล่าง) — logAudit ถูกเรียกจากแทบทุก
    // action ที่เขียนข้อมูล เป็นจุดเดียวที่คุมทุกการเขียนลงชีตนี้อยู่แล้ว จึงล้าง
    // แคชที่นี่ที่เดียวได้ครบ ไม่ต้องไปเพิ่มทีละจุดที่เรียก logAudit
    CacheService.getScriptCache().remove(AUDIT_LOGS_CACHE_KEY);
  } catch (e) {
    console.error("Audit Log Error: " + e);
  }
}

// ==========================================
// 🔒 กัน Spreadsheet formula injection — ช่องกรอกอิสระของผู้ใช้ (ชื่อนักเรียน,
// รายละเอียด "อื่นๆ: ...", ห้อง ฯลฯ) เขียนลง Google Sheets ตรงๆ ผ่าน setValue()/
// appendRow() ซึ่งตีความสตริงที่ขึ้นต้นด้วย =, +, -, @ เป็น "สูตร" เหมือนพิมพ์เอง
// ในหน้า Sheets ทุกประการ — ถ้ามีใครแอบพิมพ์ข้อความอันตราย (เช่น
// "=IMPORTXML(...)" ที่ส่งข้อมูลออกไปเซิร์ฟเวอร์ภายนอก) ผ่านช่องกรอกอิสระเหล่านี้
// แล้วมีคนเปิดชีต Records ตรงๆ ด้วย Google Sheets เอง (ไม่ผ่านหน้าเว็บ) สูตรนั้น
// จะรันทันที — ฟังก์ชันนี้ขึ้นต้นด้วย ' ให้ Sheets บังคับอ่านเป็นข้อความล้วนแทน
// ถ้าเจอว่าขึ้นต้นด้วยอักขระกลุ่มนี้
function sanitizeForSheetCell_(value) {
  const str = String(value == null ? '' : value);
  return /^[=+\-@]/.test(str) ? ("'" + str) : str;
}

// ==========================================
// ดึงประวัติการทำงานจากชีต Audit_Logs ให้หน้าเว็บแสดง — เฉพาะผู้ดูแลระบบเท่านั้น
// เดิมข้อมูลนี้บันทึกไว้ตั้งแต่แรกแล้ว แต่ไม่มี UI ให้ดู ต้องเปิด Google Sheet เอง
// จำกัดจำนวนแถวที่ส่งกลับไว้ (ล่าสุดก่อน) กันไม่ให้ payload ใหญ่เกินไปเมื่อสะสม
// นานๆ เข้า
//
// 🚀 แคชผลลัพธ์ไว้ 30 วินาที (แบบเดียวกับ readActiveRecordRows_ ใน
// Service_Records.gs / getProbationByStudent_ ใน Service_Probation.gs) — ชีต
// Audit_Logs สะสมแถวเพิ่มขึ้นเรื่อยๆ ไม่มีสิ้นสุด (ทุกการสร้าง/แก้/ลบทั้งรายการ
// ตัดคะแนน/ทัณฑ์บน/ผู้ใช้งาน เขียนลงที่นี่หมด) ไม่แคชไว้เลยจะยิ่งช้าลงเรื่อยๆ ตาม
// อายุการใช้งานระบบ ต่างจาก getRecords ที่แคชไว้แล้วตั้งแต่แรก
// ==========================================
const AUDIT_LOGS_CACHE_KEY = 'audit_logs_v1';
const AUDIT_LOGS_CACHE_TTL_SECONDS = 30;

function getAuditLogs(token) {
  requireAdmin(token);

  const cached = getChunkedCache_(AUDIT_LOGS_CACHE_KEY);
  if (cached) {
    try { return { status: "success", data: JSON.parse(cached) }; } catch (e) { /* อ่านแคชไม่ขึ้น อ่านจากชีตใหม่แทน */ }
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Audit_Logs");
  if (!sheet) return { status: "success", data: [] }; // ยังไม่เคยมีการบันทึกเหตุการณ์ใดเลย

  const data = sheet.getDataRange().getValues();
  const logs = [];
  for (let i = 1; i < data.length; i++) {
    logs.push({
      timestamp: String(data[i][0] || ""),
      user: String(data[i][1] || ""),
      action: String(data[i][2] || ""),
      targetId: String(data[i][3] || ""),
      status: String(data[i][4] || ""),
    });
  }

  logs.reverse(); // ล่าสุดขึ้นก่อน
  const MAX_ROWS = 500;
  const result = logs.slice(0, MAX_ROWS);

  putChunkedCache_(AUDIT_LOGS_CACHE_KEY, JSON.stringify(result), AUDIT_LOGS_CACHE_TTL_SECONDS);

  return { status: "success", data: result };
}

// ==========================================
// 🔐 Password hashing (ใช้ร่วมกันทั้งไฟล์ — เดิมมีโค้ดซ้ำอยู่ใน Service_Auth.gs
// สองที่ ย้ายมารวมไว้ที่เดียวเพื่อไม่ให้ hash เพี้ยนกันระหว่างจุดใช้งาน)
//
// 🧂 รองรับ salt แล้ว (ป้องกัน rainbow table attack ถ้าฐานข้อมูลรั่วไหล) — ใส่
// salt เป็น parameter ที่ 2 ได้ ถ้าไม่ใส่ (undefined) จะ hash แบบไม่มี salt เหมือน
// เดิม เพื่อให้บัญชีเก่าที่สร้างก่อนหน้านี้ (ยังไม่มี salt) ยัง login ได้ตามปกติ
// บัญชีใหม่ที่สร้างผ่าน createUser() หรือรีเซ็ตรหัสผ่านผ่าน updateUser() จะได้
// salt ใหม่ให้อัตโนมัติ ค่อยๆ ทยอยอัปเกรดทุกบัญชีไปเป็นแบบมี salt เอง
// ==========================================
function hashPassword(pass, salt) {
  const input = salt ? (pass + salt) : pass;
  const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  let txtHash = '';
  for (let i = 0; i < rawHash.length; i++) {
    let hashVal = rawHash[i];
    if (hashVal < 0) hashVal += 256;
    if (hashVal.toString(16).length === 1) txtHash += '0';
    txtHash += hashVal.toString(16);
  }
  return txtHash;
}

function generateSalt() {
  return Utilities.getUuid().replace(/-/g, '');
}

// ==========================================
// 🔑 Session management
// ก่อนหน้านี้ทุก action (addRecord, getRecords, updateRecord ฯลฯ) ไม่มีการ
// ตรวจสอบตัวตนผู้เรียกเลย ใครก็ยิง POST ตรงไปที่ URL ของเว็บแอปนี้ได้โดยไม่ต้อง login
// ผ่านหน้าเว็บก่อน ส่วนนี้เพิ่ม session token แบบง่าย (เหมาะกับสเกลของระบบนี้ ไม่ต้อง
// พึ่งไลบรารีภายนอก) ให้ Main.gs ใช้ตรวจสอบก่อนอนุญาตทำ action ใดๆ
//
// CacheService มีอายุสูงสุด 6 ชม./ครั้ง (21600 วินาที) — ถ้าต้องการเซสชันอายุยาวกว่านี้
// ควรเปลี่ยนไปเก็บใน Sheet หรือ PropertiesService แทน
// ==========================================
// สิทธิ์แบ่งเป็น 3 ระดับ (ต้องตรงกับ src/utils/permissions.js ฝั่งเว็บเสมอ):
//   1. ADMIN_ROLES           = ผู้ดูแลระบบเต็มรูปแบบ (จัดการผู้ใช้งาน, ลบรายการ,
//                              ดู Audit Log, เห็นทุกรายการ)
//   2. FULL_VISIBILITY_ROLES = เห็นรายการของทุกคนในหน้ารายงานได้ แต่ไม่มีสิทธิ์
//                              ผู้ดูแลระบบข้อ 1
//   3. ที่เหลือ (เช่น ครูผู้สอน) = เห็นเฉพาะรายการที่ตัวเองบันทึก (ดู getMyRecords
//                              ใน Service_Records.gs)
//
// 'Admin' และ 'บุคลากรงานปกครอง' เก็บไว้รองรับบัญชีเก่าเท่านั้น (ดูคำอธิบายฝั่ง
// permissions.js) บัญชีใหม่ใช้ 'ผู้ดูแลระบบ' / 'เจ้าหน้าที่งานปกครอง' แทน
const ADMIN_ROLES = ['Admin', 'ผู้ดูแลระบบ', 'บุคลากรงานปกครอง', 'เจ้าหน้าที่งานปกครอง', 'หัวหน้างานปกครอง'];
const FULL_VISIBILITY_ROLES = ['ครูปกครอง', 'ผู้อำนวยการสถานศึกษา', 'รองผู้อำนวยการสถานศึกษา'];
const SESSION_TTL_SECONDS = 21600;

// ==========================================
// 🏷️ จัดกลุ่ม role ดิบ (เช่น "ผู้ดูแลระบบ") ให้เป็น tier ง่ายๆ 3 ระดับ
// ('admin' | 'full' | 'normal') — เดิมฝั่งเว็บ (src/utils/permissions.js) เก็บ
// รายชื่อ ADMIN_ROLES/FULL_VISIBILITY_ROLES ซ้ำกับด้านบนเป๊ะๆ เอง เสี่ยงแก้ที่นี่
// แล้วลืมแก้ฝั่งเว็บ (หรือกลับกัน) ทำให้เมนู/สิทธิ์ที่ควรเห็นในหน้าเว็บไม่ตรงกับ
// สิทธิ์จริงที่ backend บังคับ (บังคับจริงอยู่ที่นี่เสมอ ไม่ว่าเว็บจะแสดงอะไร)
//
// ตอนนี้ backend เป็นเจ้าของข้อมูลจริงที่เดียว — ส่ง roleTier แนบไปกับ user
// object ตอน login (ดู handleLogin ใน Service_Auth.gs) ให้เว็บเช็กแค่ roleTier
// พอ ไม่ต้องเก็บรายชื่อ role เองอีกต่อไป และ getRoleTiers() (ดู Service_Users.gs)
// ส่ง map นี้ทั้งก้อนให้หน้า "จัดการผู้ใช้งาน" ใช้จัดหมวดบัญชีอื่นที่ไม่ใช่ตัวเอง
// ==========================================
function roleTierOf_(role) {
  if (ADMIN_ROLES.indexOf(role) !== -1) return 'admin';
  if (FULL_VISIBILITY_ROLES.indexOf(role) !== -1) return 'full';
  return 'normal';
}

function buildRoleTierMap_() {
  const map = {};
  ADMIN_ROLES.forEach((r) => { map[r] = 'admin'; });
  FULL_VISIBILITY_ROLES.forEach((r) => { map[r] = 'full'; });
  return map;
}

function createSession(user) {
  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put('session_' + token, JSON.stringify({
    username: user.username,
    role: user.role
  }), SESSION_TTL_SECONDS);
  return token;
}

// 🧠 จำผลตรวจ session/rate limit ไว้ "ภายในคำขอเดียว" — doPost ใน Main.gs เรียก
// requireSession ก่อนเข้า handler แล้ว handler ส่วนใหญ่ (getMyRecords, getOffenses,
// getRpaStats, getAuditLogs, getUsersList, ทัณฑ์บน ฯลฯ) เรียกซ้ำอีกรอบ ทำให้เรียก
// CacheService 6 ครั้งแทน 3 และนับ rate limit ซ้ำสองต่อ 1 คำขอ (เพดาน 120/นาที
// เหลือจริงราว 60) — ตอนนี้ตรวจจริงครั้งเดียวต่อ token ที่เหลือคืนผลที่จำไว้
//
// ⚠️ ต้องเรียก resetRequestMemo_() ที่ต้น doPost เสมอ (ทำแล้วใน Main.gs) กัน
// ตัวแปรระดับไฟล์ค้างข้ามคำขอถ้า Apps Script นำ runtime เดิมกลับมาใช้ — ไม่งั้น
// token ที่หมดอายุ/logout ไปแล้วอาจยังผ่านได้จากค่าที่จำไว้ของคำขอก่อนหน้า
let REQUEST_MEMO_ = { sessions: {}, rateChecked: {} };

function resetRequestMemo_() {
  REQUEST_MEMO_ = { sessions: {}, rateChecked: {} };
}

function getSession(token) {
  if (!token) return null;
  if (Object.prototype.hasOwnProperty.call(REQUEST_MEMO_.sessions, token)) {
    return REQUEST_MEMO_.sessions[token];
  }
  const cache = CacheService.getScriptCache();
  const raw = cache.get('session_' + token);
  const session = raw ? JSON.parse(raw) : null;
  REQUEST_MEMO_.sessions[token] = session;
  return session;
}

// โยน Error ถ้าไม่ได้ login หรือ token หมดอายุ — ให้ doPost ใน Main.gs
// จับ error นี้แล้วตอบกลับเป็น JSON error ตามปกติ
// 🛡️ เช็ก rate limit ที่นี่ด้วย (ดู checkRateLimit_ ใน Service_Ops.gs) เพราะเป็น
// จุดเดียวที่ทุก action (ยกเว้น login) ต้องผ่านอยู่แล้ว ครอบคลุมทุก endpoint ทันที
function requireSession(token) {
  const session = getSession(token);
  if (!session) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  if (!REQUEST_MEMO_.rateChecked[token]) {
    checkRateLimit_(token);
    REQUEST_MEMO_.rateChecked[token] = true;
  }
  return session;
}

// ใช้กับ action ที่ต้องเป็นผู้ดูแลระบบเท่านั้น เช่น การจัดการผู้ใช้งาน
function requireAdmin(token) {
  const session = requireSession(token);
  if (ADMIN_ROLES.indexOf(session.role) === -1) {
    throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้');
  }
  return session;
}

// ใช้กับ action ระดับงานปกครอง/วินัย เช่น การบันทึกทัณฑ์บน — ไม่ควรเปิดให้ครู
// ผู้สอนทั่วไปบันทึกเองได้ฝ่ายเดียว แต่ก็ไม่จำเป็นต้องจำกัดแค่ "ผู้ดูแลระบบ" เต็ม
// รูปแบบ (ซึ่งเป็นสิทธิ์ระดับจัดการผู้ใช้งาน/ระบบ คนละเรื่องกับงานปกครอง) จึงเปิด
// ให้ทั้งแอดมินและกลุ่มเห็นทุกรายการ (ครูปกครอง, ผู้อำนวยการ ฯลฯ) ทำได้
function requireDisciplineStaff_(token) {
  const session = requireSession(token);
  if (ADMIN_ROLES.indexOf(session.role) === -1 && FULL_VISIBILITY_ROLES.indexOf(session.role) === -1) {
    throw new Error('คุณไม่มีสิทธิ์เข้าถึงฟังก์ชันนี้');
  }
  return session;
}

// 🔓 ยกเลิก session จริงฝั่งเซิร์ฟเวอร์ตอนกด "ออกจากระบบ" — เดิมกด logout แค่ลบ
// currentUser ออกจาก localStorage ฝั่ง browser เท่านั้น token เดิมยังใช้งานได้จน
// ครบ 6 ชม.ตามปกติ ถ้ามีใครขโมย token ไปได้ก่อนหน้านั้นก็ยังใช้ต่อได้อยู่ ฟังก์ชันนี้
// ลบ token ออกจาก CacheService ทันที ทำให้ token เดิมใช้ไม่ได้อีกทันทีที่ logout
function revokeSession(token) {
  if (token) {
    CacheService.getScriptCache().remove('session_' + token);
    delete REQUEST_MEMO_.sessions[token];
  }
  return { status: "success", message: "ออกจากระบบเรียบร้อยแล้ว" };
}
