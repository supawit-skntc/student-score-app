import { academicYearOf } from '../data/academicYear';

// แยกออกมาจาก Dashboard.jsx/Report.jsx/StudentProfile.jsx ที่เคยมีฟังก์ชันนี้
// ก็อปกันอยู่เหมือนเป๊ะทั้ง 3 ที่ — รวมไว้ที่เดียวกันแก้แล้วลืมอีกที่ (records.points
// จาก GAS อาจมาเป็นทั้ง "-5" หรือ "5" แล้วแต่จุดที่เขียน ฟังก์ชันนี้ทำให้ได้เลข
// บวกเสมอไม่ว่าจะมี "-" นำหน้าหรือไม่)
export function parsePoints(points) {
  const n = parseInt(String(points).replace('-', ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// คะแนนสะสมของนักเรียนแต่ละคนเฉพาะ "ปีการศึกษาที่ระบุ" (รีเซ็ตทุกปีตามข้อ 11) — เดิมลูปนี้เขียนซ้ำใน
// Dashboard.jsx และ Report.jsx (StudentProfile.jsx ต้องเก็บประวัติรายรายการด้วยจึงยังคิดเอง)
// คืน Map: รหัสนักเรียน -> { name, total, count }
export function currentYearStudentTotals(records, academicYear) {
  const map = new Map();
  records.forEach((r) => {
    if (academicYearOf(r.date) !== academicYear) return;
    const prev = map.get(r.studentId) || { name: r.displayFullName, total: 0, count: 0 };
    prev.total += parsePoints(r.points);
    prev.count += 1;
    map.set(r.studentId, prev);
  });
  return map;
}
