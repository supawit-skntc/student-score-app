// กัน stored XSS เวลาต้องแทรกข้อความที่มาจากผู้ใช้ (ชื่อนักเรียน, รายละเอียด
// ฐานความผิด "อื่นๆ: ...") ลงใน SweetAlert2's `html:` option ตรงๆ — ต่างจากการ
// render ใน JSX ปกติ (React escape ให้อัตโนมัติอยู่แล้ว) แต่ Swal.fire({ html })
// ใส่สตริงเป็น HTML ดิบไม่ escape ให้ ถ้าครูคนไหน (บัญชีถูกขโมย/ตั้งใจร้าย) พิมพ์
// เช่น "<img src=x onerror=...>" ลงชื่อนักเรียนหรือช่อง "อื่นๆ" แล้วแอดมินมาเปิด
// popup ยืนยันลบทีหลัง โค้ดนั้นจะรันในเบราว์เซอร์ของแอดมินทันที (ขโมย token ใน
// localStorage/ทำ action แทนแอดมินได้) ต้อง escape ทุกครั้งก่อนแทรกลง html:
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
