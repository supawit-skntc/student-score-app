// สถานะ sync เข้าระบบ RMS (rmsSyncStatus จาก getRecords) ใช้ร่วมกันทุกหน้าที่แสดงรายการตัดคะแนน —
// เดิมประกาศไว้แค่ใน Report.jsx ทำให้หน้าอื่น (เช่น StudentProfile.jsx) ที่โชว์รายการเดียวกันไม่มีป้ายนี้
// ให้ครูเห็นว่า "รายการนี้เข้า RMS จริงหรือยัง" ทั้งที่ backend ส่งข้อมูลมาให้อยู่แล้ว
export const SYNC_STATUS_MAP = {
  pending: { label: 'รอส่งเข้า RMS', cls: 'bg-gold-50 text-gold-700' },
  synced: { label: 'เข้า RMS แล้ว', cls: 'bg-ok-bg text-ok-fg' },
  needs_review: { label: 'ต้องตรวจสอบ', cls: 'bg-warn-bg text-warn-fg' },
  error: { label: 'ผิดพลาด', cls: 'bg-bad-bg text-bad-fg' },
};
