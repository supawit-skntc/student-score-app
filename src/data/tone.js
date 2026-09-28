// สีตามระดับความรุนแรง (notice/warn/critical) ใช้ร่วมกันทุกจุดที่ต้องไล่สีตามความรุนแรง — เดิมประกาศ
// object หน้าตาเดียวกันซ้ำ 3 ที่ (AtRiskStudentsCard.jsx มี 2 ชุดซ้ำกันเองในไฟล์เดียวด้วยซ้ำ, StudentProfile.jsx
// อีก 1 ชุด) เสี่ยงแก้สีที่นึงแล้วอีกที่ไม่ตามกัน
export const TONE_CLS = {
  notice: 'bg-gold-50 text-gold-700',
  warn: 'bg-warn-bg text-warn-fg',
  critical: 'bg-bad-bg text-bad-fg',
};
