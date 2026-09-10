// ==========================================
// ไฟล์ Service_Users.gs : จัดการผู้ใช้งานระบบ
// ทุกฟังก์ชันในไฟล์นี้เป็นสิทธิ์ผู้ดูแลระบบ (Admin) เท่านั้น — requireAdmin()
// จะโยน error ทันทีถ้าผู้เรียกไม่ใช่ admin หรือไม่ได้ login
// ==========================================

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
  sheet.appendRow([username, saltedHash, newUserData.fullName || '', newUserData.role || '', salt]);

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

  sheet.getRange(rowIndex, 3).setValue(updatedData.fullName || '');
  sheet.getRange(rowIndex, 4).setValue(updatedData.role || '');

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
