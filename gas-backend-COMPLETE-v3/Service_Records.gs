// ==========================================
// ไฟล์ Service_Records.gs : CRUD หลักของรายการตัดคะแนน (ชีต Records)
// ฟังก์ชันที่เกี่ยวกับ RPA Bot (คิวงาน, สถิติ) แยกไปอยู่ Service_RpaBot.gs แล้ว
// ==========================================

function processRecordTransaction(token, data) {
  const session = getSession(token);
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID).getSheetByName("Records");
    const uuid = Utilities.getUuid();
    const timestamp = new Date().toISOString();

    const pdfUrl = generatePDF(data, uuid);

    const rowData = [
      uuid, timestamp, data.date, data.studentId, data.nameTitle || "",
      data.studentName, data.fieldOfStudy, data.level, data.year, data.room,
      data.offense, data.points, data.teacherName, pdfUrl,
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
    ];

    sheet.appendRow(rowData);

    logAudit(data.teacherName, "CREATE_RECORD", data.studentId, "SUCCESS");

    return { status: "success", message: "บันทึกสำเร็จ", pdfUrl: pdfUrl };

  } catch (e) {
    logAudit(data.teacherName, "CREATE_RECORD", data.studentId, "FAILED: " + e.message);
    return { status: "error", message: "ระบบเกิดข้อผิดพลาด: " + e.message };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// 1. อ่านแถวข้อมูลดิบจากชีต (ข้ามรายการที่ถูกลบไปแล้ว) — ใช้ร่วมกันระหว่าง
// getRecords() และ getMyRecords() กันโค้ดอ่าน/แปลงข้อมูลซ้ำกันสองที่
// ==========================================
function readActiveRecordRows_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][17]) continue; // ข้ามรายการที่ถูกลบไปแล้ว (soft delete — คอลัมน์ R)
    rows.push(data[i]);
  }
  return rows;
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

  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(updatedData.id)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) return { status: "error", message: "ไม่พบข้อมูลที่ต้องการแก้ไข" };

  const oldPdfUrl = String(data[rowIndex - 1][13]);
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

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      const rowIndex = i + 1;
      sheet.getRange(rowIndex, 18).setValue(new Date().toISOString());
      logAudit(session.username, "DELETE_RECORD", String(data[i][3] || ""), "SUCCESS");
      return { status: "success", message: "ลบรายการเรียบร้อยแล้ว" };
    }
  }

  return { status: "error", message: "ไม่พบรายการที่ id นี้: " + id };
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
