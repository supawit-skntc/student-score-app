// คำนวณปีการศึกษา (พ.ศ.) จากวันที่ — ตามธรรมเนียมสถานศึกษาไทย ปีการศึกษาเริ่ม
// ประมาณกลางเดือนพฤษภาคม ใช้เกณฑ์ง่ายๆ ว่า:
//   เดือน >= 5 (พ.ค. เป็นต้นไป) -> นับเป็นปีการศึกษาของปีปฏิทินนั้น
//   เดือน < 5 (ม.ค.-เม.ย.)      -> นับเป็นปีการศึกษาของปีปฏิทินก่อนหน้า
// แล้วแปลงเป็น พ.ศ. (บวก 543) — ตรวจสอบแล้วว่าตรงกับค่า default จริงในระบบ RMS
// (เดือนกันยายน 2569 ค.ศ.2026 -> RMS เลือก "1/2569" ให้อัตโนมัติพอดี)
//
// ใช้คำนวณจาก "วันที่" ของแต่ละรายการโดยตรง ไม่ต้องเพิ่มคอลัมน์ใหม่ใน Google Sheets
export function academicYearOf(isoDate) {
  if (!isoDate) return null;
  const [y, m] = isoDate.split('-').map(Number);
  if (!y || !m) return null;
  const beYear = m >= 5 ? y : y - 1;
  return beYear + 543;
}

export function currentAcademicYear() {
  const d = new Date();
  return academicYearOf(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
}

// เทอมมีไว้ "เรียกชื่อ/แสดงผล" เท่านั้น — ไม่กระทบการนับคะแนนสะสม ซึ่งยังคง
// รวมตลอดปีการศึกษาเหมือนเดิมตามระเบียบข้อ 11 (ยกเลิกคะแนนเมื่อขึ้นปีการศึกษา
// ใหม่ เว้นแต่โดนทำทัณฑ์บนแล้ว) — ห้ามใช้ฟังก์ชันนี้ไปคำนวณ/กรองคะแนนสะสมแทน
// academicYearOf เดิมเด็ดขาด เพราะจะทำให้ยอดคะแนนผิดไปจากระเบียบจริง
//   เทอม 1 = พ.ค.-ก.ย., เทอม 2 = ต.ค.-เม.ย. (ของปีการศึกษาเดียวกัน)
export function academicTermOf(isoDate) {
  if (!isoDate) return null;
  const [, m] = isoDate.split('-').map(Number);
  if (!m) return null;
  return (m >= 5 && m <= 9) ? 1 : 2;
}

export function currentAcademicTerm() {
  const d = new Date();
  return academicTermOf(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
}

// ป้ายชื่อเทอมพร้อมปีการศึกษา เช่น "เทอม 1/2569" — ใช้แสดงผล/ตั้งชื่อช่วงเวลา
// เท่านั้น ไม่ใช่ตัวเลขคะแนนสะสม (ดูคำเตือนด้านบน)
export function termLabel(isoDate) {
  const term = academicTermOf(isoDate);
  const year = academicYearOf(isoDate);
  if (!term || !year) return '';
  return `เทอม ${term}/${year}`;
}

export function currentTermLabel() {
  const d = new Date();
  return termLabel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
}
