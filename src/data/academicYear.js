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
