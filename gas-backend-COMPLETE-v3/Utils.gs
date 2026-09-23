function logAudit(user, action, targetId, status) {
  try {
    const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName("Audit_Logs");
    sheet.appendRow([new Date().toISOString(), user, action, targetId, status]);
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
// ==========================================
function getAuditLogs(token) {
  requireAdmin(token);

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
  return { status: "success", data: logs.slice(0, MAX_ROWS) };
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

function getSession(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get('session_' + token);
  return raw ? JSON.parse(raw) : null;
}

// โยน Error ถ้าไม่ได้ login หรือ token หมดอายุ — ให้ doPost ใน Main.gs
// จับ error นี้แล้วตอบกลับเป็น JSON error ตามปกติ
// 🛡️ เช็ก rate limit ที่นี่ด้วย (ดู checkRateLimit_ ใน Service_Ops.gs) เพราะเป็น
// จุดเดียวที่ทุก action (ยกเว้น login) ต้องผ่านอยู่แล้ว ครอบคลุมทุก endpoint ทันที
function requireSession(token) {
  const session = getSession(token);
  if (!session) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  checkRateLimit_(token);
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
  }
  return { status: "success", message: "ออกจากระบบเรียบร้อยแล้ว" };
}
