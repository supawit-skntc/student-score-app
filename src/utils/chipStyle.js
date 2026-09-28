// สีของปุ่มชิปแบบเลือกได้ (เลือกอยู่/ไม่ได้เลือก) ใช้ซ้ำกันหลายหน้า (Report.jsx, DeductionForm.jsx,
// StudentProfile.jsx) — เดิมพิมพ์ข้อความคลาสชุดนี้ซ้ำมือทุกจุด แยกออกมาให้แก้ที่เดียวจบ ขนาด/ระยะห่าง
// ของแต่ละจุดต่างกันไปตามบริบท จึงให้ผู้เรียกประกอบคลาสอื่นเองรอบนอก ฟังก์ชันนี้คืนแค่สี/ขอบ
export function chipToneCls(active) {
  return active
    ? 'border-brand-500 bg-brand-50 text-brand-700'
    : 'border-[#EADFDF] bg-white text-ink-soft hover:bg-line-soft';
}
