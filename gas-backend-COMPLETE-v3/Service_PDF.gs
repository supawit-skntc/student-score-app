function generatePDF(data, refId) {
    if (!data) return "";

    // 1. 🗓️ แปลงวันที่เป็นภาษาไทย — ใช้ formatThaiDate_ ร่วมกับจุดอื่น (Utils.gs)
    // แทนอาร์เรย์ชื่อเดือนที่เคยก็อบปี้แยกไว้ที่นี่ ส่ง {long:true} เพื่อให้ได้ชื่อ
    // เดือนเต็มแบบเดิม ("สิงหาคม" ไม่ใช่ "ส.ค.")
    const thaiDate = data.date ? formatThaiDate_(data.date, { long: true }) : "ไม่ระบุวันที่";

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
    // 🔒 เดิมแชร์แบบ DOMAIN_WITH_LINK (ใครก็ได้ในโดเมน Google Workspace ของ
    // วิทยาลัยที่มีลิงก์ดูได้) แต่พบว่านักเรียนบางคนก็มีบัญชีอยู่ในโดเมนเดียวกัน
    // ด้วย (ยืนยันจากผู้ใช้งานแล้ว) ทำให้นักเรียนที่ได้ลิงก์ PDF มาไม่ว่าทางใด
    // เปิดดูประวัติวินัยของเพื่อนได้ทั้งที่ไม่ควรมีสิทธิ์เข้าถึงเลย — เปลี่ยนมา
    // แชร์เฉพาะรายชื่ออีเมลบุคลากรที่มีบัญชีในระบบนี้จริง (ดู getStaffEmails_ ใน
    // Service_Users.gs) แทน ตัดนักเรียนออกไปโดยอัตโนมัติเพราะไม่มีบัญชีในชีต
    // Users ตั้งแต่แรก — บัญชีที่ยังไม่ได้กรอกอีเมลไว้จะเปิดลิงก์นี้ไม่ได้ ต้องเติม
    // อีเมลให้ครบผ่านหน้า "จัดการผู้ใช้งาน" ก่อน
    //
    // 🛡️ ถ้ายังไม่มีอีเมลบุคลากรคนไหนบันทึกไว้เลย (เช่น เพิ่ง deploy โค้ดชุดนี้
    // แต่ยังไม่ได้เติมอีเมลให้ครบ) ต้อง fallback กลับไปแชร์แบบ DOMAIN_WITH_LINK
    // แบบเดิมไว้ก่อน — ห้าม "ไม่แชร์อะไรเลย" เด็ดขาด เพราะนั่นแย่กว่าปัญหาที่กำลัง
    // แก้เสียอีก (เอกสารที่เพิ่งสร้างจะเปิดไม่ได้เลยแม้แต่ครูที่เพิ่งบันทึกเอง)
    // พอมีใครสักคนเติมอีเมลแล้ว รายการที่สร้างหลังจากนั้นจะแคบลงเองอัตโนมัติ
    const staffEmails = getStaffEmails_();
    if (staffEmails.length > 0) {
        try {
            pdfFile.addViewers(staffEmails);
        } catch (err) {
            // addViewers() ทั้งก้อนอาจล้มเหลวถ้ามีอีเมลใดอีเมลหนึ่งผิดรูปแบบ/ไม่ใช่
            // บัญชี Google จริง (เช่น พิมพ์ผิดตอนกรอก) ลองแชร์ทีละคนแทน กันเอกสาร
            // ทั้งฉบับไม่มีใครได้สิทธิ์ดูเลยเพราะอีเมลเดียวผิด
            staffEmails.forEach((email) => {
                try { pdfFile.addViewer(email); } catch (e2) { console.error('แชร์ PDF ให้ ' + email + ' ไม่สำเร็จ: ' + e2); }
            });
        }
    } else {
        pdfFile.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    }

    newFile.setTrashed(true);

    return pdfFile.getUrl();
}

// ==========================================
// รันครั้งเดียวจาก Apps Script Editor (เลือกฟังก์ชันนี้แล้วกด Run) หลัง deploy
// โค้ดชุดที่เปลี่ยนการแชร์ PDF จาก DOMAIN_WITH_LINK มาเป็นเฉพาะอีเมลบุคลากร (ดู
// คำอธิบายเต็มที่ generatePDF() ด้านบน) — แก้ได้เฉพาะไฟล์ที่สร้างใหม่หลังจากนั้น
// อัตโนมัติเท่านั้น ไฟล์ PDF เก่าที่มีอยู่แล้วก่อนหน้านี้ยังแชร์แบบเดิมค้างอยู่
// (นักเรียนที่อยู่โดเมนเดียวกันยังเปิดดูได้ถ้าได้ลิงก์เก่ามา) ต้องรันฟังก์ชันนี้
// เพื่อแก้ย้อนหลังให้ไฟล์เก่าทั้งหมดด้วย
//
// วนอ่านทุกไฟล์ PDF ในโฟลเดอร์ CONFIG.FOLDER_ID เฉพาะไฟล์ที่ยังแชร์แบบลิงก์กว้างๆ
// อยู่ (ข้ามไฟล์ที่แก้ไปแล้วจากรอบก่อนหน้าโดยอัตโนมัติ ปลอดภัยที่จะรันซ้ำได้เสมอ)
// — Apps Script จำกัดเวลารันสูงสุด 6 นาที/ครั้ง ถ้าไฟล์เยอะมากจนรันไม่ทันในรอบ
// เดียว ให้กด Run ซ้ำได้เรื่อยๆ จนกว่า Logger จะรายงานว่าตรวจไม่เจอไฟล์ที่ต้อง
// แก้อีกแล้ว
// ==========================================
function migrateExistingPdfSharingToStaffOnly_() {
    const staffEmails = getStaffEmails_();

    // 🛡️ ห้ามรันต่อเด็ดขาดถ้ายังไม่มีอีเมลบุคลากรคนไหนเลย — โค้ดเดิมจะ setSharing
    // เป็น PRIVATE/NONE ให้ทุกไฟล์ก่อนเสมอ แล้ว "ค่อย" เช็กว่ามีอีเมลให้แชร์กลับไหม
    // ทีหลัง ถ้าตอนนั้นยังไม่มีอีเมลเลยสักคน จะกลายเป็นล็อกเอกสารประวัติวินัยทั้ง
    // หมดไม่ให้ใครดูได้เลยแม้แต่คนเดียว (แย่กว่าปัญหาเดิมที่ตั้งใจจะแก้เสียอีก) —
    // ต้องเติมอีเมลอย่างน้อย 1 บัญชีในหน้า "จัดการผู้ใช้งาน" ก่อนรันฟังก์ชันนี้เสมอ
    if (staffEmails.length === 0) {
        Logger.log('ยังไม่มีอีเมลบุคลากรบันทึกไว้เลยสักบัญชี — หยุดทำงานทันที ไม่แตะไฟล์ใดๆ ' +
            'กรุณาเติมอีเมลให้อย่างน้อย 1 บัญชีในหน้า "จัดการผู้ใช้งาน" ก่อน แล้วค่อยรันฟังก์ชันนี้ใหม่ ' +
            '(ถ้ารันต่อตอนนี้ ไฟล์ PDF เก่าทั้งหมดจะถูกล็อกไม่ให้ใครดูได้เลย)');
        return;
    }

    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    const files = folder.getFilesByType(MimeType.PDF);

    const MAX_RUNTIME_MS = 5 * 60 * 1000; // เผื่อเวลาไว้ก่อนชนขีดจำกัด 6 นาทีของ Apps Script
    const startTime = Date.now();
    let checked = 0;
    let fixed = 0;

    while (files.hasNext()) {
        if (Date.now() - startTime > MAX_RUNTIME_MS) {
            Logger.log('ใกล้ครบเวลาที่กำหนดไว้แล้ว หยุดรอบนี้ก่อน (ตรวจไป ' + checked + ' ไฟล์ แก้แล้ว ' + fixed + ' ไฟล์) — กด Run ซ้ำอีกครั้งเพื่อทำต่อจากไฟล์ที่เหลือ');
            return;
        }

        const file = files.next();
        checked++;

        try {
            const access = file.getSharingAccess();
            if (access === DriveApp.Access.DOMAIN_WITH_LINK || access === DriveApp.Access.ANYONE_WITH_LINK || access === DriveApp.Access.ANYONE) {
                // ตอนนี้มั่นใจแล้วว่า staffEmails ไม่ว่างแน่นอน (เช็กไว้ตั้งแต่ต้น
                // ฟังก์ชันแล้วด้านบน) จึงปลอดภัยที่จะลบสิทธิ์เดิมก่อนแล้วค่อยแชร์
                // ใหม่โดยไม่มีช่วงเวลาที่ไฟล์ไม่มีใครเข้าถึงได้เลย
                file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
                file.addViewers(staffEmails);
                fixed++;
            }
        } catch (e) {
            Logger.log('แก้สิทธิ์ไฟล์ ' + file.getName() + ' ไม่สำเร็จ: ' + e);
        }
    }

    Logger.log('เสร็จสมบูรณ์ — ตรวจสอบไปทั้งหมด ' + checked + ' ไฟล์ แก้สิทธิ์การแชร์ไปแล้ว ' + fixed + ' ไฟล์ (ที่เหลือแชร์แบบจำกัดอยู่แล้วตั้งแต่แรก ไม่ต้องแก้)');
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
