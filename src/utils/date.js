// คืนวันที่ปัจจุบันตามเวลาเครื่อง (ท้องถิ่น) เป็น YYYY-MM-DD — ห้ามใช้
// new Date().toISOString() ตรงๆ เพราะฟังก์ชันนั้นคำนวณเป็นเวลา UTC เสมอ ประเทศไทย
// เร็วกว่า UTC 7 ชั่วโมง ถ้าเปิดฟอร์มช่วงเที่ยงคืนถึงตี 6 กว่าๆ ตามเวลาไทย ค่าที่ได้
// จาก toISOString() จะยังเป็น "เมื่อวาน" อยู่ทั้งที่ปฏิทินเครื่องข้ามวันไปแล้ว
export function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
