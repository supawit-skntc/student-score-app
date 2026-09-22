// แยกออกมาจาก Dashboard.jsx/Report.jsx/StudentProfile.jsx ที่เคยมีฟังก์ชันนี้
// ก็อปกันอยู่เหมือนเป๊ะทั้ง 3 ที่ — รวมไว้ที่เดียวกันแก้แล้วลืมอีกที่ (records.points
// จาก GAS อาจมาเป็นทั้ง "-5" หรือ "5" แล้วแต่จุดที่เขียน ฟังก์ชันนี้ทำให้ได้เลข
// บวกเสมอไม่ว่าจะมี "-" นำหน้าหรือไม่)
export function parsePoints(points) {
  const n = parseInt(String(points).replace('-', ''), 10);
  return Number.isFinite(n) ? n : 0;
}
