// 🐢 เดิมเขียน SPREADSHEET_ID: SpreadsheetApp.getActiveSpreadsheet().getId() ตรงๆ
// ในออบเจกต์ ซึ่งรันตอน "โหลดสคริปต์" ทุกครั้งที่มีคำขอเข้ามา (ทุก doPost/trigger)
// เรียกบริการ Spreadsheet 1 รอบเสมอแม้คำขอนั้นไม่ได้ใช้ ID นี้เลย (เช่น อ่าน
// รายการตัดคะแนน) — ตอนนี้เป็น getter ที่เรียกเมื่อมีคนใช้จริงเท่านั้น และจำผลไว้
// ภายในการรันนั้น ค่าที่ได้เหมือนเดิมทุกประการ ผู้เรียก CONFIG.SPREADSHEET_ID
// เดิมไม่ต้องแก้อะไร
let SPREADSHEET_ID_MEMO_ = null;

const CONFIG = {
  get SPREADSHEET_ID() {
    if (!SPREADSHEET_ID_MEMO_) SPREADSHEET_ID_MEMO_ = SpreadsheetApp.getActiveSpreadsheet().getId();
    return SPREADSHEET_ID_MEMO_;
  },
  FOLDER_ID: "1esVLkFHHqkWPSR1c4Z9K-je_3E5WLEF7",
  TEMPLATE_ID: "1O12nW9msC54n5Vk_ngaeMTKvaUNfpFGrWrQ3GoGSsNo",
  // 📧 อีเมลรับการแจ้งเตือนอัตโนมัติเมื่อเซิร์ฟเวอร์เกิดข้อผิดพลาดที่ไม่คาดคิด
  // (ดู notifyAdminOfError_ ใน Service_Ops.gs) — ใส่อีเมลผู้ดูแลระบบที่นี่ เช่น
  // "admin@sktc.ac.th" ถ้าเว้นว่างไว้ ระบบจะไม่ส่งอีเมลแจ้งเตือนใดๆ (ปิดเงียบๆ)
  ADMIN_ALERT_EMAIL: ""
};

// ==========================================
// รายการฐานความผิด + คะแนนตัดเริ่มต้น — "เจ้าของข้อมูลจริง" ที่เดียวของทั้งระบบ
// (ก่อนหน้านี้ข้อมูลชุดนี้ hardcode ซ้ำกันอยู่ถึง 2-3 ที่: src/data/offenses.js
// ฝั่งเว็บ, if/else เทียบข้อความใน generatePDF() ที่ Service_PDF.gs, และ
// NO_REPEAT_SAME_DAY_OFFENSES ใน Service_Records.gs — เสี่ยงแก้ที่เดียวแล้วอีก
// ที่ไม่ตรงกันแบบเงียบๆ ไม่มี error เตือน เช่น PDF ติ๊กผิดช่องถ้าเพิ่ม/แก้ฐาน
// ความผิดแล้วลืมแก้ checkbox mapping)
//
// ตอนนี้เซิร์ฟเวอร์เป็นเจ้าของข้อมูลจริงที่เดียว ส่งให้ฝั่งเว็บผ่าน action
// "getOffenses" (ดู getOffenses() ด้านล่าง — เว็บเรียกใน src/data/offenses.js)
// generatePDF() ใน Service_PDF.gs และ processRecordTransaction() ใน
// Service_Records.gs ก็อ่านจากชุดนี้โดยตรงแทนการ hardcode ข้อความเองอีกต่อไป
//
// checkboxIndex คือตำแหน่งช่องติ๊ก {{c1}}..{{c14}} ในเทมเพลตเอกสาร PDF ต้นแบบ —
// ผูกกับตำแหน่งจริงในเอกสาร Google Slides ห้ามสลับลำดับโดยไม่เช็กเทมเพลตก่อน
// (ลำดับรายการด้านล่างจัดกลุ่มตามคะแนนเพื่อ UX ฝั่งเว็บ คนละเรื่องกับ checkboxIndex)
//
// อ้างอิงจากระเบียบวิทยาลัยเทคนิคสมุทรสาครว่าด้วยหลักเกณฑ์การพิจารณาลงโทษนักเรียน
// นักศึกษา พ.ศ. 2566 ข้อ 11 — "อื่นๆ" ไม่มีคะแนนตายตัวตามระเบียบ (ให้ใช้ดุลยพินิจ)
// ==========================================
const OFFENSES = [
  {
    label: "แต่งกายผิดระเบียบ", points: 5, ref: "ข้อ 11.1(1)", noRepeatSameDay: true, checkboxIndex: 0,
    note: "ฐานความผิดนี้ตัดซ้ำในวันเดียวกันไม่ได้ — ให้โอกาสนักเรียนไปแก้ไขก่อน",
  },
  {
    label: "ทรงผมผิดระเบียบ/ทำสีผม", points: 5, ref: "ข้อ 11.1(1)", noRepeatSameDay: true, checkboxIndex: 1,
    note: "ฐานความผิดนี้ตัดซ้ำในวันเดียวกันไม่ได้ — ให้โอกาสนักเรียนไปแก้ไขก่อน",
  },
  { label: "หนีเรียน", points: 10, ref: "ข้อ 11.2(3)", checkboxIndex: 6 },
  { label: "สูบบุหรี่", points: 10, ref: "ข้อ 11.2(4)", checkboxIndex: 8 },
  { label: "ชู้สาว", points: 15, ref: "ข้อ 11.3(2)", checkboxIndex: 7 },
  { label: "ดูหมิ่น ก้าวร้าว ครู และบุคคลอื่น", points: 15, ref: "ข้อ 11.3(3)", checkboxIndex: 11 },
  { label: "ทะเลาะวิวาท", points: 20, ref: "ข้อ 11.4(6)", checkboxIndex: 2 },
  { label: "ลักขโมย", points: 20, ref: "ข้อ 11.4(11)", checkboxIndex: 4 },
  { label: "ทำลายทรัพย์สินของวิทยาลัยฯ", points: 20, ref: "ข้อ 11.4(12)", checkboxIndex: 5 },
  { label: "เล่นการพนัน", points: 20, ref: "ข้อ 11.4(5)", checkboxIndex: 3 },
  { label: "ดื่มสุราหรือของมึนเมา", points: 20, ref: "ข้อ 11.4(2)", checkboxIndex: 10 },
  { label: "บุหรี่ไฟฟ้า/กัญชา/กระท่อม/เสพยาเสพติดประเภท ๑ - ๕", points: 20, ref: "ข้อ 11.4(1)", checkboxIndex: 12 },
  {
    label: "พกพาอาวุธ", points: 20, ref: "ข้อ 11.4(7)", checkboxIndex: 9,
    note: "หากเป็นอาวุธปืนหรือวัตถุระเบิด ต้องส่งคณะกรรมการปกครองพิจารณาแทน (ข้อ 11.5)",
  },
  { label: "อื่นๆ", points: null, ref: null, checkboxIndex: 13 },
];

function findOffenseEntry_(label) {
  return OFFENSES.find((o) => o.label === label);
}

// 🛡️ ตรวจสอบเองตอนสคริปต์เริ่มทำงานว่าไม่มี checkboxIndex ซ้ำกัน — คอมเมนต์
// ด้านบนบอกไว้ว่า "ห้ามสลับ/ซ้ำ" แต่คอมเมนต์เพียวๆ ไม่กันคนแก้โค้ดพลาดได้จริง
// (เช่น copy entry เดิมมาทำอันใหม่แล้วลืมเปลี่ยน index) ถ้าเกิดซ้ำกันขึ้นมาจริง
// อยากให้ทุก request พังทันทีพร้อม error ชัดเจน ดีกว่าปล่อยให้ generatePDF()
// ติ๊กผิดช่อง/ทับกันแบบเงียบๆ โดยไม่มีใครรู้
(function assertOffenseCheckboxIndicesUnique_() {
  const seen = new Set();
  OFFENSES.forEach((o) => {
    if (seen.has(o.checkboxIndex)) {
      throw new Error('OFFENSES มี checkboxIndex ซ้ำกัน: ' + o.checkboxIndex + ' ("' + o.label + '") — ตรวจสอบ Config.gs');
    }
    seen.add(o.checkboxIndex);
  });
})();

// เว็บเรียกตอนเปิดฟอร์มบันทึก/รายงาน (ดู fetchOffenses ใน src/data/offenses.js)
// — ไม่ส่ง checkboxIndex กลับไปเพราะเป็นรายละเอียดการใช้งานภายในของ generatePDF()
// เท่านั้น ฝั่งเว็บไม่ต้องรู้
function getOffenses(token) {
  requireSession(token);
  const data = OFFENSES.map((o) => ({
    label: o.label,
    points: o.points,
    ref: o.ref,
    note: o.note || null,
    noRepeatSameDay: !!o.noRepeatSameDay,
  }));
  return { status: "success", data: data };
}
