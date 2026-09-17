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
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Users");

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
    if (rowPassHash === inputHash) {
      const user = {
        username: rowUser,
        name: String(data[i][2]).trim(),
        role: String(data[i][3]).trim()
      };

      // 🔑 ออก session token ให้ frontend เก็บไว้แนบกับทุก request ถัดไป
      const token = createSession(user);
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

// ==========================================
// ฟังก์ชันสำหรับแอดมิน: ใช้สร้างค่า Hash เพื่อเอาไปแปะในฐานข้อมูลด้วยมือ (กรณีฉุกเฉิน)
// ปกติควรใช้หน้า "จัดการผู้ใช้งาน" ในเว็บแอปแทน เพราะเรียก createUser() ให้ครบ
// ทุกขั้นตอนอัตโนมัติอยู่แล้ว (รวมถึงสร้าง salt ให้ด้วย) ฟังก์ชันนี้เก็บไว้เผื่อกรณี
// Web App ใช้งานไม่ได้ชั่วคราว — หมายเหตุ: บัญชีที่สร้างด้วยมือผ่านฟังก์ชันนี้จะ
// ไม่มี salt (คอลัมน์ E ว่าง) ยังใช้งานได้ปกติแต่ปลอดภัยน้อยกว่าเล็กน้อย
// ==========================================
function generateHashForNewUser() {
  const newPassword = "1234"; // <--- เปลี่ยนรหัสผ่านที่ต้องการสร้าง Hash ตรงนี้
  Logger.log("รหัสผ่านต้นฉบับ: " + newPassword);
  Logger.log("นำค่า Hash นี้ไปใส่ในคอลัมน์ Password: " + hashPassword(newPassword));
}
