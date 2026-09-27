// ==========================================
// ไฟล์ Service_Records.gs : CRUD หลักของรายการตัดคะแนน (ชีต Records)
// ฟังก์ชันที่เกี่ยวกับ RPA Bot (คิวงาน, สถิติ) แยกไปอยู่ Service_RpaBot.gs แล้ว
// ==========================================

// แปลงค่าวันที่จากเซลล์ชีต (อาจเป็น Date object หรือ string ก็ได้) ให้เป็น
// "YYYY-MM-DD" เพื่อเทียบกับ data.date ที่ส่งมาจากฟอร์ม (input type="date")
function toIsoDateString_(rawDate) {
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return String(rawDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// เช็กว่านักเรียนคนนี้เคยถูกบันทึกฐานความผิดเดียวกันนี้ในวันเดียวกันไปแล้วหรือยัง
// — รับ rows ที่อ่านมาแล้วจากผู้เรียก (ดูเหตุผลที่ processRecordTransaction()
// อ่านครั้งเดียวแล้วส่งต่อแทนที่จะให้ฟังก์ชันนี้อ่านเอง)
function hasSameDayDuplicate_(rows, studentId, offense, dateStr) {
  if (!rows) return false;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (String(row[3]).trim() !== String(studentId).trim()) continue;
    if (String(row[10]).trim() !== offense) continue;
    if (toIsoDateString_(row[2]) === dateStr) return true;
  }
  return false;
}

// ==========================================
// 🔁 กันบันทึกซ้ำ (idempotency) — ปุ่ม "บันทึกข้อมูล" เป็นขั้นตอนที่ช้าที่สุดใน
// ระบบ (สร้าง PDF หลายวินาที) ยิ่ง request ใช้เวลานาน ยิ่งมีโอกาสที่ Google จะทำ
// response หายกลางทางก่อนถึงเบราว์เซอร์ ทั้งที่บันทึกสำเร็จลงชีตไปแล้วจริง (เจอ
// เคสจริงแล้ว) ฝั่งเว็บจะสุ่ม clientRequestId มาแนบด้วยทุกครั้งที่เปิดฟอร์ม — ถ้า
// เจอว่ารหัสนี้เคยถูกบันทึกไปแล้ว ให้ถือว่าสำเร็จทันที ไม่สร้าง PDF ซ้ำ ไม่เพิ่ม
// แถวซ้ำเด็ดขาด (คอลัมน์ T: Client_Request_Id — ดู setupClientRequestIdColumn)
//
// รับ rows ที่อ่านมาแล้วจากผู้เรียกเหมือนกับ hasSameDayDuplicate_() ด้านบน (เดิม
// ทั้งสองฟังก์ชันนี้ต่างคนต่างเรียก readActiveRecordRows_() เอง ทำให้ทุกครั้งที่
// บันทึกฐานความผิดที่ตัดซ้ำวันเดียวกันไม่ได้ (แต่งกาย/ทรงผม) ต้องอ่านทั้งชีต/แคช
// Records ซ้ำ 2 รอบก่อนจะรู้ผล — เห็นได้ชัดว่าช้ากว่าการบันทึกฐานความผิดอื่นจริงๆ)
// ==========================================
function findRecordByClientRequestId_(rows, clientRequestId) {
  if (!rows) return null;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][19] || "") === String(clientRequestId)) {
      return { id: String(rows[i][0] || ""), pdfUrl: String(rows[i][13] || "") };
    }
  }
  return null;
}

// ==========================================
// 🧹 ตรวจและทำความสะอาดข้อมูลรายการตัดคะแนนที่รับมาจากหน้าเว็บ — จุดเดียวสำหรับทั้งเพิ่ม
// (processRecordTransaction) และแก้ไข (updateRecord) เดิมสองฟังก์ชันนี้เชื่อค่าจากหน้าเว็บ
// ตรงๆ เป็นส่วนใหญ่: รหัสนักเรียน/ระดับ/ปี/คะแนน/วันที่ไม่ผ่านตัวกรองสูตร Sheets เลย
// (ใครเรียก API ตรงๆ ใส่ "=IMPORTXML(...)" ลงช่องรหัสนักเรียนได้ ซึ่งเป็นช่องโหว่ formula
// injection) และไม่มีการตรวจรูปแบบ/ช่วงค่าเลย (คะแนน 99999, วันที่ปี 2569 ที่พิมพ์เป็น ค.ศ. ฯลฯ)
//
// คืนค่า { value: {...ข้อมูลที่ผ่านการตรวจและกรองแล้ว...}, pointsNote } หรือ { error: "ข้อความภาษาไทย" }
// ==========================================
const RECORD_LEVELS_ = ['ปวช.', 'ปวส.'];
const RECORD_MAX_POINTS_ = 100;

function isValidIsoDate_(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function normalizeRecordInput_(data, session, existingTeacherName) {
  if (!data || typeof data !== 'object') return { error: 'ไม่พบข้อมูลรายการ' };
  const str = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const fail = (message) => ({ error: message });

  const date = str(data.date);
  if (!isValidIsoDate_(date)) return fail('วันที่ไม่ถูกต้อง (ต้องเป็นวันที่จริง เช่น 2026-09-24)');
  const parts = date.split('-').map(Number);
  const now = new Date();
  const latest = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  if (parts[0] < 2020 || new Date(parts[0], parts[1] - 1, parts[2]) > latest) {
    return fail('วันที่อยู่นอกช่วงที่เป็นไปได้ (ตรวจว่าไม่ได้พิมพ์ปีเป็น พ.ศ.)');
  }

  const studentId = str(data.studentId);
  if (!/^[0-9A-Za-z-]{4,20}$/.test(studentId)) return fail('รหัสนักเรียนไม่ถูกต้อง (ใช้ตัวเลข/ตัวอักษรอังกฤษ 4-20 ตัว)');

  const studentName = str(data.studentName);
  if (!studentName) return fail('กรุณาระบุชื่อ-นามสกุล');
  if (studentName.length > 120) return fail('ชื่อ-นามสกุลยาวเกินไป');

  const nameTitle = str(data.nameTitle);
  const fieldOfStudy = str(data.fieldOfStudy);
  const room = str(data.room);
  if (nameTitle.length > 20 || fieldOfStudy.length > 100 || room.length > 10) return fail('ข้อมูลนักเรียนบางช่องยาวเกินไป');

  const level = str(data.level);
  if (RECORD_LEVELS_.indexOf(level) === -1) return fail('ระดับชั้นไม่ถูกต้อง (ปวช. หรือ ปวส.)');
  const year = str(data.year);
  if (!/^[1-4]$/.test(year)) return fail('ชั้นปีไม่ถูกต้อง');

  let offense = str(data.offense);
  let offenseEntry;
  if (offense.indexOf('อื่นๆ') === 0) {
    const detail = offense.replace(/^อื่นๆ\s*:?\s*/, '');
    if (!detail) return fail('กรุณาระบุรายละเอียดความผิดอื่นๆ');
    if (offense.length > 200) return fail('รายละเอียดความผิดยาวเกินไป');
    offense = 'อื่นๆ: ' + detail;
    offenseEntry = findOffenseEntry_('อื่นๆ');
  } else {
    offenseEntry = findOffenseEntry_(offense);
    if (!offenseEntry) return fail('ฐานความผิดไม่ถูกต้อง');
  }

  // ข้อมูลเก่าบางแถวเก็บคะแนนเป็นค่าติดลบ (เช่น "-5") — ฝั่งเว็บอ่านด้วย parsePoints() ที่ตัดเครื่องหมายลบทิ้งอยู่แล้ว จึงรับได้เหมือนกัน (เก็บเป็นค่าบวกเสมอ)
  const pointsRaw = str(data.points).replace(/^-/, '');
  const points = Number(pointsRaw);
  if (!pointsRaw || !Number.isInteger(points) || points < 1 || points > RECORD_MAX_POINTS_) {
    return fail('คะแนนที่ตัดต้องเป็นจำนวนเต็ม 1-' + RECORD_MAX_POINTS_);
  }
  // 🔒 คะแนนแก้ไขเองไม่ได้ (คำขอ 27/9/69): ฐานความผิดที่มีคะแนนกำหนดไว้แล้วต้องตรงเป๊ะ ส่วน "อื่นๆ" เลือกได้
  // เฉพาะ OTHER_OFFENSE_POINTS (ดู Config.gs) — เดิมยอมให้ต่างจากระเบียบได้แล้วแค่บันทึกโน้ตไว้ ตอนนี้ปฏิเสธเลย
  if (offenseEntry && offenseEntry.points != null && points !== offenseEntry.points) {
    return fail('คะแนนของฐานความผิดนี้กำหนดไว้ตายตัวที่ ' + offenseEntry.points + ' คะแนน แก้ไขเองไม่ได้');
  }
  if (offense.indexOf('อื่นๆ') === 0 && OTHER_OFFENSE_POINTS.indexOf(points) === -1) {
    return fail('คะแนนสำหรับฐานความผิด "อื่นๆ" ต้องเป็น ' + OTHER_OFFENSE_POINTS.join(', ') + ' เท่านั้น');
  }

  // ครูผู้บันทึก: เชื่อชื่อจาก session (ยืนยันแล้วตอนเข้าสู่ระบบ) ก่อนเสมอ ไม่เชื่อค่าจากหน้าเว็บที่ปลอมได้
  // ตอนแก้ไขให้คงชื่อผู้บันทึกเดิมไว้ (existingTeacherName) ไม่ให้กลายเป็นชื่อคนที่มาแก้
  const teacherName = str(existingTeacherName || (session && session.name) || data.teacherName);
  if (teacherName.length > 100) return fail('ชื่อครูผู้บันทึกยาวเกินไป');

  return {
    value: {
      date: date,
      studentId: studentId,
      nameTitle: sanitizeForSheetCell_(nameTitle),
      studentName: sanitizeForSheetCell_(studentName),
      fieldOfStudy: sanitizeForSheetCell_(fieldOfStudy),
      level: level,
      year: year,
      room: sanitizeForSheetCell_(room),
      offense: sanitizeForSheetCell_(offense),
      points: points,
      teacherName: sanitizeForSheetCell_(teacherName),
    },
  };
}

// รหัสอ้างอิงการส่งจากหน้าเว็บ (UUID/สุ่ม) — รูปแบบไม่ตรงถือว่าไม่มี (ไม่ปฏิเสธคำขอทั้งก้อน)
function cleanClientRequestId_(value) {
  const s = String(value == null ? '' : value).trim();
  return /^[\w-]{8,64}$/.test(s) ? s : '';
}

// 🔁 เช็กรหัสซ้ำ "แบบสด" จาก 300 แถวล่าสุดของชีตจริง (ไม่ใช้แคช) — เรียกเฉพาะตอนถือ lock แล้ว เพื่อให้
// การกดซ้ำ/ลองใหม่ที่วิ่งชนกันพอดี (คำขอแรกยังเขียนอยู่ คำขอลองใหม่มาถึงก่อนแคชถูกล้าง) ไม่สร้างแถวซ้ำ
// เดิมเช็กก่อนขอ lock จากแคช (เก่าได้สูงสุด 30 วินาที) จึงมีช่องว่างให้สองคำขอผ่านการเช็กพร้อมกัน
function findRecentClientRequestId_(sheet, clientRequestId) {
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;
    const first = Math.max(2, lastRow - 299);
    const n = lastRow - first + 1;
    const ids = sheet.getRange(first, 20, n, 1).getValues();
    for (let i = n - 1; i >= 0; i--) {
      if (String(ids[i][0] || '') === clientRequestId) {
        const row = sheet.getRange(first + i, 1, 1, 14).getValues()[0];
        return { id: String(row[0] || ''), pdfUrl: String(row[13] || '') };
      }
    }
  } catch (e) {
    // ชีตยังไม่มีคอลัมน์ T (ยังไม่ได้รัน setupClientRequestIdColumn) — ข้ามการเช็กนี้ ไม่ให้บันทึกพัง
  }
  return null;
}

function processRecordTransaction(token, data) {
  const session = getSession(token);
  // 🔒 audit log ใช้ตัวตนที่ยืนยันแล้วจาก session ไม่ใช่ data.teacherName ที่ฝั่งเว็บส่งมาเอง
  // (ปลอมได้ — ใครเรียก API ตรงก็ใส่ชื่อคนอื่นได้)
  const auditActor = session ? session.username : '';
  const targetId = data && data.studentId ? String(data.studentId).slice(0, 30) : '';

  try {
    const clean = normalizeRecordInput_(data, session, '');
    if (clean.error) {
      logAudit(auditActor, "CREATE_RECORD", targetId, "REJECTED_INVALID_INPUT: " + clean.error);
      return { status: "error", message: clean.error };
    }
    const rec = clean.value;
    const clientRequestId = cleanClientRequestId_(data.clientRequestId);

    // 🚀 อ่านครั้งเดียว (จากแคชได้) ใช้ร่วมกันทั้ง 2 การเช็กด้านล่าง
    const rows = readActiveRecordRows_();
    if (rows === null) return { status: "error", message: "ไม่พบแผ่นงานข้อมูลระบบ" };

    if (clientRequestId) {
      const existing = findRecordByClientRequestId_(rows, clientRequestId);
      if (existing) {
        logAudit(auditActor, "CREATE_RECORD", rec.studentId, "SUCCESS (duplicate submit — already recorded)");
        return { status: "success", message: "บันทึกสำเร็จ", id: existing.id, pdfUrl: existing.pdfUrl };
      }
    }

    // ฐานความผิดที่ระเบียบกำหนดว่าห้ามบันทึกซ้ำในวันเดียวกัน (noRepeatSameDay ใน Config.gs)
    const offenseEntry = findOffenseEntry_(rec.offense);
    if (offenseEntry && offenseEntry.noRepeatSameDay &&
        hasSameDayDuplicate_(rows, rec.studentId, rec.offense, rec.date)) {
      logAudit(auditActor, "CREATE_RECORD", rec.studentId, "BLOCKED_DUPLICATE_SAME_DAY: " + rec.offense);
      return {
        status: "error",
        message: `นักเรียนคนนี้ถูกบันทึก "${rec.offense}" ไปแล้วในวันที่ ${rec.date} — ฐานความผิดนี้บันทึกซ้ำในวันเดียวกันไม่ได้ตามระเบียบ`
      };
    }

    const uuid = Utilities.getUuid();
    const timestamp = new Date().toISOString();

    const rowData = [
      // A-M (ข้อมูลผ่านการตรวจและกรองสูตรแล้วจาก normalizeRecordInput_ ทุกช่อง)
      uuid, timestamp, rec.date, rec.studentId, rec.nameTitle, rec.studentName, rec.fieldOfStudy,
      rec.level, rec.year, rec.room, rec.offense, rec.points, rec.teacherName,
      // N: pdfUrl — เว้นว่างไว้ก่อนเสมอ ไม่สร้าง PDF ในคำขอนี้ (ให้ฝั่งเว็บเรียก generateRecordPdf ต่อ และมี
      // trigger เบื้องหลัง processPendingPdfs_ คอยสร้างซ้ำทุก 1 นาที ดู Service_PDF.gs)
      "",
      // O, P, Q — สถานะคิวของ RPA Bot: "pending" = ยังไม่เคยส่งไปบันทึกใน RMS
      "pending", "", "",
      "", // R: Deleted_At (ว่าง = ยังไม่ถูกลบ)
      // S: Created_By_Username — ใช้กับ getMyRecords() ให้ครูทั่วไปเห็นเฉพาะรายการของตัวเอง
      session ? session.username : "",
      // T: Client_Request_Id — กันบันทึกซ้ำเวลา response หายกลางทาง
      clientRequestId,
    ];

    // 🔒 ขอ lock เฉพาะช่วง "เช็กซ้ำสด + เขียนแถวใหม่" (แค่เสี้ยววินาที ไม่คลุมการสร้าง PDF)
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000);
    } catch (lockErr) {
      return { status: "error", message: "ระบบกำลังบันทึกรายการของผู้อื่นอยู่ กรุณากดบันทึกอีกครั้งในอีกสักครู่" };
    }
    try {
      const sheet = getSheet_("Records");
      if (!sheet) return { status: "error", message: "ไม่พบแผ่นงานข้อมูลระบบ" };

      if (clientRequestId) {
        const dup = findRecentClientRequestId_(sheet, clientRequestId);
        if (dup) {
          logAudit(auditActor, "CREATE_RECORD", rec.studentId, "SUCCESS (duplicate submit — already recorded)");
          return { status: "success", message: "บันทึกสำเร็จ", id: dup.id, pdfUrl: dup.pdfUrl };
        }
      }

      sheet.appendRow(rowData);
      invalidateRecordsCache_();
    } finally {
      lock.releaseLock();
    }

    logAudit(auditActor, "CREATE_RECORD", rec.studentId, "SUCCESS");
    return { status: "success", message: "บันทึกสำเร็จ", id: uuid, pdfUrl: "" };

  } catch (e) {
    logAudit(auditActor, "CREATE_RECORD", targetId, "FAILED: " + e.message);
    return { status: "error", message: "ระบบเกิดข้อผิดพลาด: " + e.message };
  }
}

// ==========================================
// 1. อ่านแถวข้อมูลดิบจากชีต (ข้ามรายการที่ถูกลบไปแล้ว) — ใช้ร่วมกันระหว่าง
// getRecords() และ getMyRecords() กันโค้ดอ่าน/แปลงข้อมูลซ้ำกันสองที่
//
// 🚀 แคชผลลัพธ์ไว้ 30 วินาที (CacheService) — เดิมทุกครั้งที่เปิดแผงควบคุม/
// รายงาน/ประวัตินักเรียน จะอ่านทั้งชีต Records ใหม่หมดทุกครั้ง ยิ่งชีตมีแถวเยอะ
// ก็ยิ่งช้า และยิ่งมีคนเปิดพร้อมกันหลายคน + RPA bot ก็ยิ่งเสี่ยงชนโควตาการอ่าน
// ของ Google (ทำให้เจอ error แปลกๆ เป็นระยะ) แคชนี้ตัดการอ่านซ้ำซ้อนออกไปเยอะ
// โดยไม่กระทบสิทธิ์การมองเห็น เพราะ cache เก็บแค่ "ข้อมูลดิบทุกแถว" การกรองว่า
// ใครเห็นรายการไหน (ดู getMyRecords) ยังทำสดใหม่ทุกครั้งจาก session ปัจจุบัน
//
// ⚠️ CacheService จำกัดค่าต่อ 1 คีย์ไว้ที่ ~100KB "ไบต์" (ภาษาไทย 1 ตัวอักษร = 3
// ไบต์) — ใช้ putChunkedCache_/getChunkedCache_ (Utils.gs) แบ่งเป็นหลายชิ้นแทนการ
// เก็บก้อนเดียว รองรับได้ราว 1,500 แถว (เดิมเต็มที่ ~180 แถวแล้วแคชหยุดทำงานเงียบๆ
// ทุกคำขอต้องอ่านทั้งชีตใหม่) เกินกว่านั้นจะข้ามการแคชไปเฉยๆ ไม่ error
// ==========================================
const RECORDS_CACHE_KEY = 'records_raw_rows_v1';
const RECORDS_CACHE_TTL_SECONDS = 30;

function readActiveRecordRows_() {
  const cached = getChunkedCache_(RECORDS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      // แคชอ่านไม่ขึ้น (ข้อมูลเพี้ยน/หมดอายุพอดี) — อ่านจากชีตตามปกติแทน
    }
  }

  const sheet = getSheet_("Records");
  if (!sheet) return null;

  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][17]) continue; // ข้ามรายการที่ถูกลบไปแล้ว (soft delete — คอลัมน์ R)
    rows.push(data[i]);
  }

  try {
    putChunkedCache_(RECORDS_CACHE_KEY, JSON.stringify(rows), RECORDS_CACHE_TTL_SECONDS);
  } catch (e) {
    // แคชพังไม่ควรทำให้ทั้งฟังก์ชันพังตาม — ปล่อยผ่าน ใช้ข้อมูลสดที่อ่านมาได้ตามปกติ
  }

  return rows;
}

// เรียกทันทีหลังบันทึก/แก้ไข/ลบรายการสำเร็จ กันไม่ให้เห็นข้อมูลเก่าค้างในแคช
// นานถึง 30 วินาทีหลังเพิ่งมีการเปลี่ยนแปลงจริง — ลบคีย์หลักอย่างเดียวพอ (ชิ้นที่
// เหลือของรุ่นเดิมอ้างถึงไม่ได้อีก หมดอายุเองตาม TTL ดูคำอธิบายที่ putChunkedCache_)
function invalidateRecordsCache_() {
  CacheService.getScriptCache().remove(RECORDS_CACHE_KEY);
}

// ==========================================
// ค้นหาตำแหน่งแถวของรายการที่มี id (คอลัมน์ A) ตรงกับที่ให้มา — รวมโค้ดที่เดิม
// กระจายซ้ำกันอยู่ 3 ที่ (updateRecord, deleteRecord, updateSyncStatus ใน
// Service_RpaBot.gs) มาไว้ที่เดียว กันแก้ตรงนึงแล้วลืมอีกตรงนึง
// คืนค่า rowIndex แบบ 1-indexed (นับรวมหัวตาราง) หรือ null ถ้าไม่เจอ
// ==========================================
//
// 🚀 อ่านเฉพาะคอลัมน์ A (id) ไม่ใช่ทั้งชีต 20 คอลัมน์แบบเดิม (getDataRange().
// getValues()) — ใช้หาแค่ id เดียว ข้อมูลที่ต้องโอนจากเซิร์ฟเวอร์ Sheets ลดเหลือราว
// 1/20 ทุกครั้งที่แก้ไข/ลบ/สร้าง PDF
function findRecordRowIndexById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const ids = sheet.getRange(1, 1, lastRow, 1).getValues();
  const target = String(id);
  for (let i = 1; i < ids.length; i++) {
    if (String(ids[i][0]) === target) {
      return i + 1;
    }
  }
  return null;
}

// ==========================================
// 🚀 แคชตำแหน่งแถวของทุกรายการ (ไม่ใช่แค่ที่ยังไม่ถูกลบ) ไว้สั้นๆ — ให้
// updateSyncStatus() ใน Service_RpaBot.gs ใช้ระหว่างที่บอทกำลังรันอยู่ ไม่ต้อง
// อ่านทั้งชีตใหม่ทุกครั้งที่มีรายการเสร็จ 1 รายการ (เดิมบอทเรียก updateSyncStatus
// ทีละรายการ แล้วแต่ละครั้งก็ getDataRange().getValues() ใหม่หมด — คิว 10 รายการ
// = อ่านทั้งชีต 10 รอบรัวๆ ติดกัน ยิ่งเสี่ยงชนโควตา/เกิด error แปลกๆ ของ Google)
//
// ปลอดภัยที่จะแคชตำแหน่งแถวไว้ได้ (ต่างจากเนื้อหาข้อมูลที่ห้ามแคชนาน) เพราะระบบนี้
// ไม่มีจุดไหนเรียก deleteRow()/insertRow() กับชีต Records เลย (ลบรายการใช้ soft
// delete เขียนคอลัมน์ R แทน) แถวจึงไม่มีวันขยับตำแหน่งตราบใดที่ยังไม่ถูกลบแถวจริง
// ==========================================
const SYNC_ROW_INDEX_CACHE_KEY = 'records_row_index_by_id_v1';
const SYNC_ROW_INDEX_CACHE_TTL_SECONDS = 600; // 10 นาที ครอบคลุมเวลารันบอท 1 รอบสบายๆ

function cacheRecordRowIndexMap_(rowIndexById) {
  try {
    const serialized = JSON.stringify(rowIndexById);
    if (serialized.length < 95000) {
      CacheService.getScriptCache().put(SYNC_ROW_INDEX_CACHE_KEY, serialized, SYNC_ROW_INDEX_CACHE_TTL_SECONDS);
    }
  } catch (e) {
    // แคชพังไม่ควรทำให้ฟังก์ชันหลักพังตาม — ปล่อยผ่าน ใช้การอ่านสดตามปกติแทน
  }
}

// คืนตำแหน่งแถวจากแคชถ้ามี (เร็ว ไม่ต้องอ่านทั้งชีต) หรือ null ถ้าไม่เจอในแคช
// (แคชหมดอายุ หรือรายการนี้ถูกสร้างหลังจากแคชล่าสุด) — ผู้เรียกต้อง fallback ไป
// ใช้ findRecordRowIndexById_() เองเสมอเมื่อได้ null กลับมา ห้ามถือว่า "ไม่พบ"
function getCachedRecordRowIndex_(id) {
  const cached = CacheService.getScriptCache().get(SYNC_ROW_INDEX_CACHE_KEY);
  if (!cached) return null;
  try {
    const map = JSON.parse(cached);
    return map[String(id)] || null;
  } catch (e) {
    return null;
  }
}

// 🔒 ใครเห็นรายการไหน (ตัดสินที่เซิร์ฟเวอร์เสมอ — หน้าเว็บไม่มีทางเห็นเกินสิทธิ์)
//  - ผู้ดูแลระบบ/กลุ่มเห็นทุกรายการ: เห็นทั้งหมด
//  - ครูผู้สอน: รายการที่ตัวเองบันทึก + รายการของนักเรียนใน "สาขาที่รับผิดชอบ" (ตั้งที่หน้าจัดการผู้ใช้งาน)
//    รายการเก่าที่ไม่มีเจ้าของ (ก่อนมีคอลัมน์ S) นับเป็นของครูที่ชื่อ-นามสกุลตรงกับช่อง "ครูผู้บันทึก"
// เดิม getRecords() ส่ง "ทุกรายการ" ให้ผู้ใช้ทุกคนที่เข้าสู่ระบบ (ครูเปิดแผงควบคุม/ประวัตินักเรียนแล้วเห็นของทั้งวิทยาลัย)
function isRecordVisibleTo_(session, row) {
  if (canAccessAllRecords_(session)) return true;
  const createdBy = String(row[18] || "").trim();
  if (createdBy) {
    if (createdBy === session.username) return true;
  } else if (session.name && String(row[12] || "").trim() === session.name) {
    return true;
  }
  const majors = session.majors || [];
  return majors.length > 0 && majors.indexOf(majorGroupOf_(row[6])) !== -1;
}

function mapRowToRecord_(row, session) {
  // formatThaiDate_/toIsoDateString_ (Utils.gs) รองรับทั้ง Date object และ
  // string อยู่แล้ว คืนค่า "" เองถ้า rawDate ว่าง ไม่ต้องเช็ก if (rawDate) ซ้ำที่นี่
  let rawDate = row[2];
  let formattedDate = formatThaiDate_(rawDate);
  let inputDateStr = rawDate ? toIsoDateString_(rawDate) : "";

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
    // ปุ่ม "แก้ไข" ในหน้าเว็บแสดงเฉพาะรายการที่แก้ได้จริง (ผู้ดูแล/กลุ่มเห็นทุกรายการ หรือเจ้าของรายการ)
    // — ตัดสินที่เซิร์ฟเวอร์ตรงนี้ ส่วนการบังคับจริงอยู่ที่ updateRecord (เห็นรายการ ≠ แก้ได้)
    canEdit: !session || canAccessAllRecords_(session) || !String(row[18] || "").trim() ||
      String(row[18]).trim() === session.username,
  };
}

// ==========================================
// 2. ฟังก์ชันดึงข้อมูล "ทั้งหมด" ให้หน้า React — ใช้กับหน้าประวัตินักเรียน/แผง
// ควบคุมที่ต้องดูคะแนนสะสมของนักเรียนทุกคนได้ ไม่ว่าใครจะเป็นคนบันทึกก็ตาม
// ==========================================
function getRecords(token) {
  const session = requireSession(token);
  const rows = readActiveRecordRows_();
  if (rows === null) return { status: "error", message: "ไม่พบแผ่นงานข้อมูลระบบ" };

  const visibleRows = canAccessAllRecords_(session) ? rows : rows.filter((row) => isRecordVisibleTo_(session, row));

  // ทัณฑ์บนมากับคำตอบเดียวกัน (ไม่ต้องยิงแยก) — ครูทั่วไปได้เฉพาะของนักเรียนที่ตัวเองเห็นรายการอยู่
  let probationByStudent = {};
  try {
    probationByStudent = probationVisibleTo_(session, getProbationByStudent_(), visibleRows);
  } catch (e) {
    console.error('โหลดข้อมูลทัณฑ์บนไม่สำเร็จ (ไม่กระทบรายการตัดคะแนนหลัก): ' + e);
  }
  return { status: "success", data: visibleRows.map((row) => mapRowToRecord_(row, session)).reverse(), probationByStudent: probationByStudent };
}

// ==========================================
// 2.1 ฟังก์ชันดึงข้อมูล "เฉพาะที่เกี่ยวข้องกับตัวเอง" — หน้ารายงานใช้แทน getRecords()
// admin เห็นทุกรายการเหมือนเดิม ส่วนครูทั่วไปเห็นเฉพาะรายการที่ตัวเองบันทึก (+
// รายการเก่าก่อนมีคอลัมน์ Created_By_Username ซึ่งยังเปิดให้ทุกคนเห็นเหมือนเดิม
// เพื่อไม่ให้ข้อมูลเก่าหายไปกะทันหัน)
// ==========================================
function getMyRecords(token) {
  // ชื่อเดิมที่หน้าเว็บรุ่นเก่ายังเรียกอยู่ — ตอนนี้ขอบเขตเดียวกับ getRecords ทุกประการ (ตัดสินตามสิทธิ์ของผู้เรียก)
  return getRecords(token);
}

// ==========================================
// 3. ฟังก์ชันอัปเดตข้อมูล (ตรวจข้อมูล + เขียนครั้งเดียว — PDF ใหม่สร้างแยกเบื้องหลัง)
// ==========================================
function updateRecord(token, updatedData) {
  // ใช้ session ปัจจุบันบันทึก audit log (ตัวตนของ "คนที่กำลังแก้ไข") ไม่ใช่ updatedData.teacherName
  const session = requireSession(token);

  const sheet = getSheet_("Records");
  if (!sheet) return { status: "error", message: "ไม่พบแผ่นงานข้อมูลระบบ" };

  const rowIndex = findRecordRowIndexById_(sheet, updatedData && updatedData.id);
  if (rowIndex === null) return { status: "error", message: "ไม่พบข้อมูลที่ต้องการแก้ไข" };

  // ⚡ อ่านทั้งแถวครั้งเดียว (เดิมอ่านทีละเซลล์ 2 ครั้ง + เขียนทีละเซลล์ 14 ครั้ง — ทุกครั้งคือการเรียก
  // บริการ Spreadsheet หนึ่งรอบ ทำให้กดบันทึกการแก้ไขช้าเกินจำเป็น)
  const row = sheet.getRange(rowIndex, 1, 1, 20).getValues()[0];
  if (row[17]) return { status: "error", message: "รายการนี้ถูกลบไปแล้ว แก้ไขไม่ได้" };

  // 🔒 ตรวจสิทธิ์ที่ฝั่งเซิร์ฟเวอร์: ผู้ดูแลระบบ/กลุ่มเห็นทุกรายการแก้ได้ทุกรายการ ครูทั่วไปแก้ได้เฉพาะของตัวเอง
  // (แถวเก่าก่อนมีคอลัมน์ S ที่ว่าง ถือว่าแก้ได้)
  if (!canAccessAllRecords_(session)) {
    const createdBy = String(row[18] || "").trim();
    if (createdBy && createdBy !== session.username) {
      logAudit(session.username, "UPDATE_RECORD", String(row[3] || ""), "DENIED_NOT_OWNER");
      return { status: "error", message: "คุณไม่มีสิทธิ์แก้ไขรายการที่ผู้อื่นเป็นผู้บันทึก" };
    }
  }

  // ตรวจ/กรองข้อมูลด้วยกฎชุดเดียวกับตอนเพิ่ม และคงชื่อครูผู้บันทึกเดิมไว้
  const clean = normalizeRecordInput_(updatedData, session, String(row[12] || ""));
  if (clean.error) {
    logAudit(session.username, "UPDATE_RECORD", String(row[3] || ""), "REJECTED_INVALID_INPUT: " + clean.error);
    return { status: "error", message: clean.error };
  }
  const rec = clean.value;

  // ลบไฟล์ PDF เดิมทิ้ง (เนื้อหาเปลี่ยนแล้ว PDF เก่าไม่ตรงอีกต่อไป)
  const oldPdfUrl = String(row[13] || "");
  try {
    if (oldPdfUrl) {
      const fileIdMatch = oldPdfUrl.match(/[-\w]{25,}/);
      if (fileIdMatch) DriveApp.getFileById(fileIdMatch[0]).setTrashed(true);
    }
  } catch (err) { console.error("ไม่สามารถลบไฟล์ PDF เดิมได้: " + err); }

  // ⚡ เขียนคอลัมน์ C-O ในครั้งเดียว: C วันที่ D รหัส E คำนำหน้า F ชื่อ G สาขา H ระดับ I ปี J ห้อง
  // K ฐานความผิด L คะแนน M ครูผู้บันทึก N pdfUrl (ล้างเป็นว่าง) O สถานะ RMS (pending)
  // PDF ใหม่ "ไม่" สร้างในคำขอนี้แล้ว (เดิมสร้างที่นี่ตรงๆ ทำให้บันทึกการแก้ไขช้าหลายวินาที และถ้าพังกลางทาง
  // ข้อมูลที่แก้จะหายทั้งก้อน) — ฝั่งเว็บเรียก generateRecordPdf ต่อ และ trigger เบื้องหลังสร้างซ้ำให้ทุกนาที
  // แก้ไขเนื้อหาแล้วส่งกลับไป sync ใหม่ใน RMS (ไม่แตะ RMS_Synced_At/RMS_Note เดิม)
  sheet.getRange(rowIndex, 3, 1, 13).setValues([[
    rec.date, rec.studentId, rec.nameTitle, rec.studentName, rec.fieldOfStudy, rec.level, rec.year,
    rec.room, rec.offense, rec.points, rec.teacherName, "", "pending",
  ]]);
  invalidateRecordsCache_();

  logAudit(session.username, "UPDATE_RECORD", rec.studentId, "SUCCESS");

  return { status: "success", message: "บันทึกการแก้ไขเรียบร้อยแล้ว กำลังจัดทำเอกสาร PDF ใหม่", newPdfUrl: "" };
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

  const sheet = getSheet_("Records");
  if (!sheet) return { status: "error", message: "ไม่พบแผ่นงานข้อมูลระบบ" };

  // 🚀 ลองตำแหน่งแถวจากแคชก่อน (getSyncQueue() เก็บไว้ให้บอท — ดู
  // getCachedRecordRowIndex_) แล้ว "ยืนยัน" ด้วยการอ่านคอลัมน์ A-D ของแถวนั้นแถวเดียว
  // ว่า id ตรงจริงก่อนลบ (ต้องอ่านคอลัมน์ D เอารหัสนักเรียนไปลง audit log อยู่แล้ว
  // จึงไม่เสียรอบเพิ่ม) กันลบผิดรายการถ้าแคชเพี้ยน เช่น มีคนแทรกแถวในชีตด้วยมือ —
  // ถ้าไม่ตรง/ไม่มีในแคช fallback ไปสแกนคอลัมน์ A ตามปกติ
  // เดิมทำ 3 ขั้นต่อเนื่อง: อ่านทั้งชีต -> อ่านคอลัมน์ D -> เขียนคอลัมน์ R
  let rowIndex = getCachedRecordRowIndex_(id);
  let head = null; // [id, timestamp, date, studentId] ของแถวที่ยืนยันแล้ว
  if (rowIndex !== null) {
    const candidate = sheet.getRange(rowIndex, 1, 1, 4).getValues()[0];
    if (String(candidate[0]) === String(id)) head = candidate;
    else rowIndex = null;
  }
  if (head === null) {
    rowIndex = findRecordRowIndexById_(sheet, id);
    if (rowIndex === null) return { status: "error", message: "ไม่พบรายการที่ id นี้: " + id };
    head = sheet.getRange(rowIndex, 1, 1, 4).getValues()[0];
  }

  const studentId = String(head[3] || "");
  sheet.getRange(rowIndex, 18).setValue(new Date().toISOString());
  invalidateRecordsCache_();
  logAudit(session.username, "DELETE_RECORD", studentId, "SUCCESS");
  return { status: "success", message: "ลบรายการเรียบร้อยแล้ว" };
}

// ==========================================
// 5. รันครั้งเดียวจาก Apps Script Editor (เลือกฟังก์ชันนี้แล้วกด Run)
// เพื่อเตรียมคอลัมน์ R (Deleted_At) สำหรับฟีเจอร์ "ลบรายการ" (soft delete)
// ==========================================
function setupDeleteColumn() {
  const sheet = getSheet_("Records");
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
  const sheet = getSheet_("Records");
  if (!sheet) throw new Error("ไม่พบแผ่นงาน Records");

  const headerCell = sheet.getRange(1, 19); // คอลัมน์ S
  if (!headerCell.getValue()) {
    headerCell.setValue("Created_By_Username");
  }

  Logger.log("ตั้งค่าคอลัมน์ Created_By_Username เรียบร้อยแล้ว");
}

// ==========================================
// 7. รันครั้งเดียวจาก Apps Script Editor เช่นกัน เพื่อเตรียมคอลัมน์ T
// (Client_Request_Id) สำหรับฟีเจอร์กันบันทึกซ้ำ (idempotency) ของปุ่ม
// "บันทึกข้อมูล" — ดูคำอธิบายเต็มที่ findRecordByClientRequestId_
// ==========================================
function setupClientRequestIdColumn() {
  const sheet = getSheet_("Records");
  if (!sheet) throw new Error("ไม่พบแผ่นงาน Records");

  const headerCell = sheet.getRange(1, 20); // คอลัมน์ T
  if (!headerCell.getValue()) {
    headerCell.setValue("Client_Request_Id");
  }

  Logger.log("ตั้งค่าคอลัมน์ Client_Request_Id เรียบร้อยแล้ว");
}
