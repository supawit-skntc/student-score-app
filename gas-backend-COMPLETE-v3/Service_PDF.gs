function generatePDF(data, refId) {
    if (!data) return "";

    // 1. 🗓️ แปลงวันที่เป็นภาษาไทย
    let thaiDate = "ไม่ระบุวันที่";
    if (data.date) {
        const dateParts = data.date.split('-'); // แยก 2026-08-03
        const months = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        const year = parseInt(dateParts[0]) + 543;
        const month = months[parseInt(dateParts[1])];
        const day = parseInt(dateParts[2]);
        thaiDate = `${day} ${month} ${year}`;
    }

    const studentId = data.studentId || "unknown";
    const docName = `บันทึกตัดคะแนน_${studentId}`;

    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    const template = DriveApp.getFileById(CONFIG.TEMPLATE_ID);
    const newFile = template.makeCopy(docName, folder);
    const slideDoc = SlidesApp.openById(newFile.getId());
    const slide = slideDoc.getSlides()[0];

    // 2. 📝 แทนที่ข้อมูลทั่วไป
    slide.replaceAllText("{{studentId}}", String(studentId));
    slide.replaceAllText("{{nameTitle}}", String(data.nameTitle || "")); // เติมคำนำหน้าชื่อ
    slide.replaceAllText("{{studentName}}", String(data.studentName || ""));
    slide.replaceAllText("{{major}}", String(data.fieldOfStudy || ""));   // สาขาวิชา
    slide.replaceAllText("{{year}}", String(data.year || ""));
    slide.replaceAllText("{{room}}", String(data.room || ""));
    slide.replaceAllText("{{points}}", String(data.points || ""));
    slide.replaceAllText("{{date}}", thaiDate);                           // ใช้วันที่ไทย
    slide.replaceAllText("{{teacher}}", String(data.teacherName || ""));  // ชื่อครูผู้สอน

    // 3. ✅ จัดการเครื่องหมายถูก ระดับชั้น ปวช. / ปวส.
    const isVocCert = (data.level === 'ปวช.') ? '✔' : ' ';
    const isDip = (data.level === 'ปวส.') ? '✔' : ' ';
    slide.replaceAllText("{{L1}}", isVocCert);
    slide.replaceAllText("{{L2}}", isDip);

    // 4. ✅ จัดการเครื่องหมายถูก ฐานความผิดทั้ง 14 ข้อ — เทียบกับ OFFENSES
    // (Config.gs) แทนการ hardcode if/else เทียบข้อความทีละเงื่อนไขแบบเดิม ซึ่ง
    // เคยเป็นสำเนาที่สองของ src/data/offenses.js เสี่ยงติ๊กผิดช่อง/ไม่ติ๊กเลย
    // แบบเงียบๆ ถ้าแก้ฐานความผิดที่นึงแล้วลืมแก้อีกที่ — ดู checkboxIndex ในนั้น
    let c = Array(14).fill(' '); // สร้างอาเรย์ช่องว่าง 14 ช่อง
    let otherText = '';
    let rawOffense = data.offense || '';

    const isOther = rawOffense.startsWith('อื่นๆ');
    const offenseEntry = findOffenseEntry_(isOther ? 'อื่นๆ' : rawOffense);

    if (offenseEntry) {
        c[offenseEntry.checkboxIndex] = '✔';
        if (isOther) {
            otherText = rawOffense.replace('อื่นๆ:', '').trim(); // ดึงข้อความหลังคำว่า อื่นๆ: มา
        }
    }

    // แทนที่ {{c1}} ถึง {{c14}} ด้วยเครื่องหมายถูกหรือช่องว่าง
    for (let i = 0; i < 14; i++) {
        slide.replaceAllText(`{{c${i+1}}}`, c[i]);
    }

    // 5. แทนที่ข้อความกรณีเลือกอื่นๆ (ไปโผล่ที่ {{otherText}})
    slide.replaceAllText("{{otherText}}", otherText);

    // ลบตัวแปรที่ค้างอยู่ทิ้งให้หมดเพื่อความสะอาดของเอกสาร
    slide.replaceAllText("{{offense}}", "");

    slideDoc.saveAndClose();

    const pdfBlob = newFile.getAs(MimeType.PDF);
    const pdfFile = folder.createFile(pdfBlob);
    // 🔒 เปลี่ยนจาก ANYONE_WITH_LINK (ใครก็ได้ทั่วโลกที่มีลิงก์ดูได้) เป็น
    // DOMAIN_WITH_LINK (ต้องล็อกอินด้วยบัญชี Google ของวิทยาลัยก่อนถึงจะดูได้)
    // เพราะ PDF นี้มีข้อมูลส่วนบุคคลของนักเรียนอยู่ (ชื่อ-สกุล รหัสนักเรียน
    // รายละเอียดความผิด) ไม่ควรเปิดให้ใครก็ได้ในโลกดูได้แค่มีลิงก์
    pdfFile.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);

    newFile.setTrashed(true);

    return pdfFile.getUrl();
}

// ==========================================
// 🚀 สร้าง PDF แบบแยกจากการบันทึกแถวข้อมูล (ดูเหตุผลเต็มที่ processRecordTransaction
// ใน Service_Records.gs) — ใช้ร่วมกันทั้งจาก action "generateRecordPdf" ที่ฝั่ง
// เว็บเรียกทันทีหลังบันทึกสำเร็จ และจาก processPendingPdfs_() ที่รันเบื้องหลังทุก
// 1 นาทีเป็น fallback เผื่อคำขอแรกล้มเหลว/หายกลางทาง
// ==========================================

// แปลงแถวดิบจากชีต (คอลัมน์ A-M) กลับเป็นรูปแบบ {studentId, studentName, ...}
// ที่ generatePDF() ต้องการ — ต้องแปลงย้อนกลับเพราะตอนนี้แถวถูกเขียนไปแล้วก่อนสร้าง
// PDF (ต่างจากเดิมที่มี "data" จากฟอร์มอยู่ในมือตอนสร้าง PDF อยู่แล้ว)
function rowToPdfData_(row) {
  return {
    date: toIsoDateString_(row[2]),
    studentId: String(row[3] || ""),
    nameTitle: String(row[4] || ""),
    studentName: String(row[5] || ""),
    fieldOfStudy: String(row[6] || ""),
    level: String(row[7] || ""),
    year: String(row[8] || ""),
    room: String(row[9] || ""),
    offense: String(row[10] || ""),
    points: String(row[11] || ""),
    teacherName: String(row[12] || ""),
  };
}

// ⚠️ ห้ามใช้ LockService คลุมฟังก์ชันนี้เด็ดขาด (จะย้อนกลับไปเจอบั๊ก lock
// contention ตัวเดิมที่เพิ่งแก้ไปตอนย้าย generatePDF ออกจาก lock) ใช้ CacheService
// เป็น advisory lock แบบเบาแทน — กันแค่กรณี generateRecordPdf (เรียกจากเว็บ) กับ
// processPendingPdfs_ (trigger เบื้องหลัง) มาชนกันสร้าง PDF ซ้ำสำหรับรายการเดียวกัน
// พอดี ไม่ได้ป้องกันการเขียนชนกันแบบ LockService (ไม่จำเป็นเพราะคนละแถวคนละไฟล์)
function generatePdfForRow_(sheet, rowIndex, recordId) {
  const existingPdfUrl = String(sheet.getRange(rowIndex, 14).getValue() || "");
  if (existingPdfUrl) {
    return { status: "success", message: "มีเอกสาร PDF อยู่แล้ว", pdfUrl: existingPdfUrl };
  }

  const cache = CacheService.getScriptCache();
  const inProgressKey = 'pdf_generating_' + recordId;
  if (cache.get(inProgressKey)) {
    return { status: "pending", message: "กำลังจัดทำเอกสาร PDF อยู่ กรุณาลองใหม่อีกครู่" };
  }
  cache.put(inProgressKey, '1', 120); // 2 นาที เผื่อเวลาสร้าง PDF ปกติเหลือเฟือ

  try {
    const row = sheet.getRange(rowIndex, 1, 1, 13).getValues()[0];
    const data = rowToPdfData_(row);
    const pdfUrl = generatePDF(data, recordId);
    sheet.getRange(rowIndex, 14).setValue(pdfUrl);
    invalidateRecordsCache_();
    return { status: "success", message: "จัดทำเอกสาร PDF สำเร็จ", pdfUrl: pdfUrl };
  } catch (e) {
    return { status: "error", message: "สร้างเอกสาร PDF ไม่สำเร็จ: " + e.message };
  } finally {
    cache.remove(inProgressKey);
  }
}

// เรียกจากฝั่งเว็บทันทีหลัง addRecord สำเร็จ (ดู DeductionForm.jsx) — ปลอดภัยที่จะ
// เรียกซ้ำได้เสมอ (idempotent) เพราะเช็ก existingPdfUrl ก่อนเสมอในฟังก์ชันด้านบน
function generateRecordPdf(token, recordId) {
  requireSession(token);
  if (!recordId) return { status: "error", message: "ไม่พบรหัสรายการ" };

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) return { status: "error", message: "ไม่พบแผ่นงานข้อมูลระบบ" };

  const rowIndex = findRecordRowIndexById_(sheet, recordId);
  if (rowIndex === null) return { status: "error", message: "ไม่พบรายการที่ id นี้: " + recordId };

  return generatePdfForRow_(sheet, rowIndex, recordId);
}

// ==========================================
// รันอัตโนมัติทุก 1 นาทีผ่าน trigger (ตั้งครั้งเดียวด้วย setupPdfBackgroundTrigger
// ด้านล่าง) เป็นตาข่ายนิรภัยสำหรับรายการที่ generateRecordPdf ตอนบันทึกล้มเหลว/
// เบราว์เซอร์ปิดไปก่อนเรียกทัน — จำกัดจำนวนรายการต่อรอบไว้กันรันนานเกินไปถ้ามี
// รายการค้างสะสมเยอะผิดปกติ (ที่เหลือจะถูกจัดการต่อในรอบถัดไปเอง)
//
// ถ้ารายการไหนสร้าง PDF ล้มเหลวติดต่อกันครบ 3 ครั้ง จะแจ้งเตือนผู้ดูแลระบบทางอีเมล
// (ดู notifyAdminOfError_ ใน Service_Ops.gs) กันไม่ให้ค้างเงียบๆ โดยไม่มีใครรู้
// ==========================================
const PDF_TRIGGER_BATCH_LIMIT = 15;

function processPendingPdfs_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Records");
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const cache = CacheService.getScriptCache();
  let processed = 0;

  for (let i = 1; i < data.length && processed < PDF_TRIGGER_BATCH_LIMIT; i++) {
    if (data[i][17]) continue; // ข้ามรายการที่ถูกลบไปแล้ว
    if (String(data[i][13] || "")) continue; // มี PDF แล้ว ข้าม

    const recordId = String(data[i][0] || "");
    const rowIndex = i + 1;
    const result = generatePdfForRow_(sheet, rowIndex, recordId);
    processed++;

    if (result.status === "error") {
      const failKey = 'pdf_fail_count_' + recordId;
      const failCount = parseInt(cache.get(failKey) || '0', 10) + 1;
      cache.put(failKey, String(failCount), 21600); // นับสะสมได้นานสุด 6 ชม. (อายุ cache สูงสุด)
      console.error('สร้าง PDF ล้มเหลวสำหรับรายการ ' + recordId + ' (ครั้งที่ ' + failCount + '): ' + result.message);

      if (failCount >= 3) {
        notifyAdminOfError_(
          new Error('สร้าง PDF ล้มเหลวซ้ำ ' + failCount + ' ครั้งติดต่อกันสำหรับรายการ ' + recordId + ': ' + result.message),
          { action: 'processPendingPdfs_' }
        );
      }
    }
  }
}

// ==========================================
// รันครั้งเดียวจาก Apps Script Editor (เลือกฟังก์ชันนี้แล้วกด Run) เพื่อตั้งเวลาให้
// processPendingPdfs_() รันอัตโนมัติทุก 1 นาที — ลบ trigger เดิมของฟังก์ชันนี้ก่อน
// เสมอ กันสร้างซ้ำซ้อนถ้าเผลอรันฟังก์ชัน setup นี้มากกว่า 1 ครั้ง
// ==========================================
function setupPdfBackgroundTrigger() {
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === 'processPendingPdfs_') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('processPendingPdfs_')
    .timeBased()
    .everyMinutes(1)
    .create();

  Logger.log('ตั้งเวลาสร้าง PDF อัตโนมัติทุก 1 นาทีเรียบร้อยแล้ว (ใช้เป็นตาข่ายนิรภัยสำรอง)');
}
