// ==========================================
// ไฟล์ Service_RpaBot.gs : ทุกอย่างที่เกี่ยวกับบอท RPA (Python) โดยเฉพาะ
// เดิมฟังก์ชันพวกนี้ปนอยู่ใน Service_Records.gs ไฟล์เดียวจนยาวเกินไป — แยกออกมา
// ตามหลักการเดียวกับ Service_Auth / Service_Users / Service_PDF / Service_OCR
// ที่แยกไฟล์ตามหน้าที่รับผิดชอบอยู่แล้ว (ไม่ต้อง import/export ใดๆ ทุกฟังก์ชันใน
// โปรเจกต์ Apps Script มองเห็นกันหมดอยู่แล้ว การแยกไฟล์นี้จึงไม่กระทบการทำงานเลย
// แค่ทำให้หาโค้ดง่ายขึ้น)
//
// บอทเรียกผ่าน HTTP API นี้แทนการต่อ Google Sheets โดยตรงด้วย Service Account
// เพราะองค์กรบล็อกการสร้าง key ไว้ (Organization Policy) เลยให้บอท "login" เป็น
// ผู้ใช้งานทั่วไป 1 บัญชีแทน ใช้ session token แบบเดียวกับที่ React ใช้อยู่แล้ว
// ปลอดภัยเท่ากันและไม่ต้องตั้งค่า Google Cloud เพิ่มเลย
// ==========================================

// ==========================================
// 1. รันครั้งเดียวจาก Apps Script Editor (เลือกฟังก์ชันนี้แล้วกด Run)
// เพื่อเตรียมชีตที่มีอยู่แล้วให้พร้อมใช้กับ RPA Bot:
//   - ใส่หัวตาราง 3 คอลัมน์ใหม่ (O, P, Q) ถ้ายังไม่มี
//   - ใส่ "pending" ให้แถวข้อมูลเก่าที่ยังไม่มีสถานะ (ทางเลือก — ดูคำอธิบายในโค้ด)
// ==========================================
function setupSyncColumns() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) throw new Error("ไม่พบแผ่นงาน Records");

  const headerRange = sheet.getRange(1, 15, 1, 3);
  const currentHeaders = headerRange.getValues()[0];
  if (!currentHeaders[0]) {
    headerRange.setValues([["RMS_Sync_Status", "RMS_Synced_At", "RMS_Note"]]);
  }

  // ⚠️ ทางเลือก: ถ้าต้องการให้ RPA Bot ย้อนไปบันทึกรายการเก่าที่มีอยู่แล้วเข้า RMS
  // ด้วย ให้เอาคอมเมนต์ 3 บรรทัดด้านล่างออก แล้วรันฟังก์ชันนี้อีกครั้ง
  // (ค่าเริ่มต้นคือไม่ทำอัตโนมัติ ป้องกันการดันข้อมูลเก่าจำนวนมากเข้า RMS โดยไม่ตั้งใจ)
  //
  // const data = sheet.getDataRange().getValues();
  // for (let i = 1; i < data.length; i++) {
  //   if (!data[i][14]) sheet.getRange(i + 1, 15).setValue("pending");
  // }

  Logger.log("ตั้งค่าคอลัมน์สำหรับ RPA Bot เรียบร้อยแล้ว");
}

// ==========================================
// 2. คิวงานให้บอทดึงไปประมวลผล (เฉพาะรายการสถานะ "pending" ที่ยังไม่ถูกลบ)
// ==========================================
function getSyncQueue() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) return { status: "error", message: "ไม่พบแผ่นงาน Records" };

  const data = sheet.getDataRange().getValues();
  const queue = [];
  // 🚀 เก็บตำแหน่งแถวของทุกรายการที่ยังไม่ถูกลบไว้ด้วยเลย (ไม่ใช่แค่ที่ pending)
  // ให้ updateSyncStatus() เอาไปใช้ต่อระหว่างบอทกำลังรันรอบนี้อยู่ ไม่ต้องอ่าน
  // ทั้งชีตซ้ำทุกครั้งที่มีรายการเสร็จ 1 รายการ (ดูคำอธิบายเต็มที่
  // cacheRecordRowIndexMap_ ใน Service_Records.gs)
  const rowIndexById = {};

  for (let i = 1; i < data.length; i++) {
    if (data[i][17]) continue; // ข้ามรายการที่ถูกลบไปแล้ว แม้จะยังมีสถานะ pending ค้างอยู่
    rowIndexById[String(data[i][0] || "")] = i + 1;

    const status = String(data[i][14] || "").trim().toLowerCase();
    if (status !== "pending") continue;

    let inputDateStr = "";
    const rawDate = data[i][2];
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        inputDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      } else {
        inputDateStr = String(rawDate);
      }
    }

    queue.push({
      id: String(data[i][0] || ""),
      date: inputDateStr,
      studentId: String(data[i][3] || ""),
      offense: String(data[i][10] || ""),
      detail: ""
    });
  }

  cacheRecordRowIndexMap_(rowIndexById);

  return { status: "success", data: queue };
}

// ==========================================
// 3. บอทเรียกกลับมาอัปเดตผลลัพธ์หลังประมวลผลแต่ละรายการ
// ==========================================
function updateSyncStatus(payload) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) return { status: "error", message: "ไม่พบแผ่นงาน Records" };

  // 🚀 ลองใช้ตำแหน่งแถวจากแคชก่อน (ที่ getSyncQueue() เพิ่งเก็บไว้ตอนต้นรอบรัน
  // ของบอท) กันอ่านทั้งชีตใหม่ทุกครั้งที่มีรายการเสร็จ 1 รายการ — ถ้าไม่เจอในแคช
  // (หมดอายุ หรือรายการนี้ไม่ได้มาจาก getSyncQueue รอบล่าสุด) ก็ fallback ไปอ่าน
  // สดตามปกติ ไม่มีทางได้ผลลัพธ์ผิดพลาดจากตรงนี้
  let rowIndex = getCachedRecordRowIndex_(payload.id);
  if (rowIndex === null) {
    rowIndex = findRecordRowIndexById_(sheet, payload.id);
  }
  if (rowIndex === null) {
    return { status: "error", message: "ไม่พบรายการที่ id นี้: " + payload.id };
  }

  sheet.getRange(rowIndex, 15).setValue(payload.status || "");
  sheet.getRange(rowIndex, 16).setValue(new Date().toISOString());
  sheet.getRange(rowIndex, 17).setValue(payload.note || "");
  // 🐛 เดิมจุดนี้ไม่เคยล้างแคชของ getRecords()/getMyRecords() เลย — พอบอทอัปเดต
  // สถานะเสร็จ แผงควบคุม/รายงานฝั่งเว็บอาจยังเห็นสถานะเก่าค้างอยู่ได้นานสุด 30
  // วินาที (อายุแคชที่ตั้งไว้) ก่อนจะรีเฟรชเป็นค่าล่าสุดเอง
  invalidateRecordsCache_();

  return { status: "success" };
}

// ==========================================
// 3.1 รับแจ้งจากบอท RPA (Python) เมื่อรันทั้ง batch ล้มเหลว (เช่น login RMS ไม่
// สำเร็จตั้งแต่ต้น หรือทุกรายการในคิวพังหมดในรอบเดียว — ดู report_bot_failure()
// ใน sheets_queue.py) — ใช้ช่องทางแจ้งเตือนอีเมลเดียวกับที่มีอยู่แล้วสำหรับ error
// ฝั่งเว็บ (ดู notifyAdminOfError_ ใน Service_Ops.gs) ไม่ต้องสร้างกลไกแจ้งเตือน
// แยกต่างหากสำหรับบอทเลย ได้ cooldown กันสแปม/ตั้งค่าอีเมลผู้รับมาฟรีๆ
// ==========================================
function reportBotFailure(token, message) {
  requireSession(token);
  notifyAdminOfError_(new Error(String(message || 'ไม่ทราบสาเหตุ')), { action: 'rpa-bot' });
  return { status: "success" };
}

// ==========================================
// 4. บันทึกประวัติการทำงานของ RPA Bot ลงชีตแยกต่างหาก "RPA_Log"
// สร้างชีตนี้อัตโนมัติถ้ายังไม่มี — ไม่ต้องตั้งค่าอะไรล่วงหน้า
// เก็บเป็นประวัติสะสมทุกครั้งที่รัน (ต่างจาก RMS_Sync_Status ในชีต Records ที่
// เก็บแค่สถานะล่าสุด) มีเวลาที่ใช้ต่อรายการด้วย ใช้เป็นข้อมูลเปรียบเทียบ
// ประสิทธิภาพสำหรับงานวิจัยได้โดยตรง
// ==========================================
function logRpaEvent(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("RPA_Log");

  if (!sheet) {
    sheet = ss.insertSheet("RPA_Log");
    sheet.appendRow(["เวลา", "รหัสรายการ (uuid)", "รหัสนักเรียน", "ฐานความผิด", "ผลลัพธ์", "รายละเอียด", "ใช้เวลา (วินาที)"]);
    sheet.getRange(1, 1, 1, 7).setFontWeight("bold");
  }

  sheet.appendRow([
    new Date().toISOString(),
    payload.recordId || "",
    payload.studentId || "",
    payload.offense || "",
    payload.status || "",
    payload.message || "",
    payload.durationSeconds || ""
  ]);

  return { status: "success" };
}

// ==========================================
// 5. สรุปสถิติการทำงานของ RPA Bot ให้แผงควบคุมแสดง
// ข้อมูลไม่อ่อนไหว (แค่จำนวน/เวลาเฉลี่ย ไม่มีชื่อนักเรียน) ผู้ใช้งานทุกคนที่ login
// แล้วเรียกได้ — ฝั่งเว็บเลือกเองว่าจะโชว์รายละเอียดนี้ให้ admin เท่านั้นก็ได้
// ==========================================
function getRpaStats(token) {
  requireSession(token);

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 🚀 นับคิวรอดำเนินการจาก readActiveRecordRows_() ตัวเดียวกับที่ getRecords()/
  // getMyRecords() ใช้ (มีแคช 30 วินาทีอยู่แล้ว) แทนการอ่านทั้งชีต Records เองอีก
  // รอบ — เดิมหน้าแผงควบคุมของ admin เรียก getRecords() กับ getRpaStats() พร้อม
  // กันทุกครั้งที่เปิดหน้า ทำให้อ่านทั้งชีต Records ซ้ำ 2 รอบโดยไม่จำเป็นทุกครั้ง
  const recordRows = readActiveRecordRows_();
  let pendingCount = 0;
  if (recordRows) {
    for (let i = 0; i < recordRows.length; i++) {
      if (String(recordRows[i][14] || "").trim().toLowerCase() === "pending") pendingCount++;
    }
  }

  const empty = {
    pendingCount, hasLogs: false, totalRuns: 0, lastRunAt: "",
    successRate: null, avgDurationSeconds: null, recentDurations: []
  };

  const logSheet = ss.getSheetByName("RPA_Log");
  if (!logSheet) return { status: "success", data: empty };

  const rows = logSheet.getDataRange().getValues().slice(1); // ตัดหัวตาราง
  if (rows.length === 0) return { status: "success", data: empty };

  let successCount = 0;
  let durationSum = 0;
  let durationCount = 0;
  let lastRunAt = "";

  rows.forEach((row) => {
    const timestamp = String(row[0] || "");
    const result = String(row[4] || "").toLowerCase();
    const duration = parseFloat(row[6]);

    if (timestamp > lastRunAt) lastRunAt = timestamp;
    if (result === "synced" || result === "submitted") successCount++;
    if (Number.isFinite(duration)) {
      durationSum += duration;
      durationCount++;
    }
  });

  const recentDurations = rows.slice(-7)
    .map((row) => parseFloat(row[6]))
    .filter((n) => Number.isFinite(n));

  return {
    status: "success",
    data: {
      pendingCount,
      hasLogs: true,
      totalRuns: rows.length,
      lastRunAt,
      successRate: Math.round((successCount / rows.length) * 100),
      avgDurationSeconds: durationCount ? Math.round((durationSum / durationCount) * 10) / 10 : null,
      recentDurations,
    }
  };
}
