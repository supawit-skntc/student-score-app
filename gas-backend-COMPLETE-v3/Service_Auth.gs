// ==========================================
// ไฟล์ Service_Auth.gs : จัดการระบบเข้าสู่ระบบ
// ==========================================

// 🔒 กันเดารหัสผ่านซ้ำๆ (brute-force) — ล็อกบัญชีชั่วคราวหลังพิมพ์รหัสผ่านผิดติดกัน
// เกินจำนวนที่กำหนด เดิมระบบไม่มีการจำกัดจำนวนครั้งที่ลองผิดเลย ใครก็เดารหัสผ่าน
// ได้ไม่จำกัดจำนวนครั้ง เก็บตัวนับด้วย CacheService (หมดอายุอัตโนมัติ ไม่ต้อง
// เคลียร์เอง) แยกตามชื่อผู้ใช้งาน ไม่กระทบบัญชีอื่น
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_SECONDS = 900; // 15 นาที

function handleLogin(username, password) {
  const cache = CacheService.getScriptCache();
  const attemptKey = 'login_fail_' + String(username).trim();
  const attempts = parseInt(cache.get(attemptKey) || '0', 10);

  if (attempts >= LOGIN_MAX_ATTEMPTS) {
    return { status: "error", message: "เข้าสู่ระบบผิดพลาดติดต่อกันหลายครั้งเกินไป กรุณารอประมาณ 15 นาทีแล้วลองใหม่" };
  }

  // ดึงข้อมูลจากแท็บ Users (ต้องสร้างแท็บนี้ใน Google Sheets ด้วย)
  const sheet = getSheet_("Users");

  if (!sheet) {
    return { status: "error", message: "ไม่พบฐานข้อมูลผู้ใช้งาน (Sheet 'Users')" };
  }

  const data = sheet.getDataRange().getValues();

  // วนลูปเช็คข้อมูล (เริ่มจาก i = 1 เพื่อข้ามหัวตาราง)
  for (let i = 1; i < data.length; i++) {
    const rowUser = String(data[i][0]).trim();
    const rowPassHash = String(data[i][1]).trim();
    // 🧂 คอลัมน์ E = Salt (อาจว่างสำหรับบัญชีเก่าที่สร้างก่อนมีระบบ salt — ยัง
    // login ได้ปกติ เพราะ hashPassword() รองรับ salt=undefined ด้วย)
    const rowSalt = data[i].length > 4 ? String(data[i][4] || '').trim() : '';

    if (rowUser !== String(username).trim()) continue;

    const inputHash = hashPassword(String(password).trim(), rowSalt || undefined);
    if (timingSafeEqual_(rowPassHash, inputHash)) {
      // 🧂 บัญชีเก่าที่ยังไม่มี salt (เก็บเป็น SHA-256 ล้วน ซึ่งค้นหารหัสผ่านยอดฮิตจากค่าแฮชได้ทันที) — ผู้ใช้เข้าสู่ระบบสำเร็จ
      // แล้วแปลว่ารู้รหัสผ่านจริง จึงเปลี่ยนเป็นแบบมี salt ให้เงียบๆ ตรงนี้เลย ไม่ต้องรอให้ผู้ดูแลรีเซ็ตรหัสผ่านให้ทีละคน
      if (!rowSalt) upgradeLegacyPasswordHash_(sheet, i + 1, data[i], String(password).trim());
      const role = String(data[i][3]).trim();
      const user = {
        username: rowUser,
        name: String(data[i][2]).trim(),
        role: role,
        // 🏷️ ดู roleTierOf_ ใน Utils.gs — เว็บใช้ค่านี้เช็กสิทธิ์แทนการเก็บรายชื่อ
        // role เองซ้ำ (src/utils/permissions.js)
        roleTier: roleTierOf_(role),
        majors: data[i].length > 6 ? parseMajors_(data[i][6]) : [], // คอลัมน์ G: สาขาที่รับผิดชอบ (ว่าง = ไม่มี)
      };

      // 🔑 ออก session token ให้ frontend เก็บไว้แนบกับทุก request ถัดไป
      const token = createSession(user);
      // 🔒 1 บัญชี ใช้งานพร้อมกันได้ทีละ 1 เครื่องเท่านั้น (คำขอผู้ใช้ 28/9/69) — ตั้ง token นี้เป็น "ล่าสุด"
      // ของบัญชีนี้ทันที เซสชันเก่าที่เครื่อง/แท็บอื่นถืออยู่ใช้ไม่ได้ทันที (ดู setActiveSession_ ใน Utils.gs)
      setActiveSession_(rowUser, token);
      cache.remove(attemptKey); // เข้าสำเร็จแล้ว — เคลียร์ตัวนับครั้งที่ผิดทิ้ง

      return {
        status: "success",
        message: "เข้าสู่ระบบสำเร็จ",
        user: user,
        token: token
      };
    }
  }

  cache.put(attemptKey, String(attempts + 1), LOGIN_LOCKOUT_SECONDS);
  return { status: "error", message: "ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง" };
}

// เขียนแฮชแบบมี salt ทับของเดิม (คอลัมน์ B รหัสผ่าน ... E salt ในการเขียนครั้งเดียว โดยคงชื่อ/บทบาทที่อ่านมาไว้ตามเดิม)
// พังตรงไหนไม่ให้กระทบการเข้าสู่ระบบ — ครั้งหน้าจะลองอัปเกรดใหม่เอง
function upgradeLegacyPasswordHash_(sheet, rowIndex, row, password) {
  try {
    const salt = generateSalt();
    sheet.getRange(rowIndex, 2, 1, 4).setValues([[hashPassword(password, salt), row[2], row[3], salt]]);
    logAudit(String(row[0]).trim(), "UPGRADE_PASSWORD_HASH", String(row[0]).trim(), "SUCCESS");
  } catch (e) {
    console.error("อัปเกรดแฮชรหัสผ่านไม่สำเร็จ (ไม่กระทบการเข้าสู่ระบบ): " + e);
  }
}

// ==========================================
// ฟังก์ชันสำหรับแอดมิน: ใช้สร้างค่า Hash เพื่อเอาไปแปะในฐานข้อมูลด้วยมือ (กรณีฉุกเฉิน)
// ปกติควรใช้หน้า "จัดการผู้ใช้งาน" ในเว็บแอปแทน เพราะเรียก createUser() ให้ครบ
// ทุกขั้นตอนอัตโนมัติอยู่แล้ว (รวมถึงสร้าง salt ให้ด้วย) ฟังก์ชันนี้เก็บไว้เผื่อกรณี
// Web App ใช้งานไม่ได้ชั่วคราว — หมายเหตุ: บัญชีที่สร้างด้วยมือผ่านฟังก์ชันนี้จะ
// ไม่มี salt (คอลัมน์ E ว่าง) ยังใช้งานได้ปกติ และระบบจะอัปเกรดเป็นแบบมี salt ให้เองตอนเข้าสู่ระบบครั้งแรก
// ==========================================
function generateHashForNewUser() {
  const newPassword = "ใส่รหัสผ่านที่ต้องการตรงนี้ (อย่างน้อย 8 ตัว)"; // <--- แก้ก่อนรัน
  Logger.log("รหัสผ่านต้นฉบับ: " + newPassword);
  Logger.log("นำค่า Hash นี้ไปใส่ในคอลัมน์ Password: " + hashPassword(newPassword));
}
