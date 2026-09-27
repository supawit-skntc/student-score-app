import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

// ปุ่มเดียวสลับซ่อน/แสดงชื่อนักเรียนทั้งหน้า (เหมือนปุ่มตาในแอปธนาคารที่กดดูยอดเงินอีกที) —
// เริ่มต้น "ซ่อนอยู่เสมอ" ทุกครั้งที่เปิดหน้านี้ใหม่ ไม่จำค่าไว้ข้ามการเปิดหน้า/ออกจากระบบ
export default function PrivacyToggle({ revealed, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1.5 self-start rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-mute transition-colors hover:bg-line-soft"
      title={revealed ? 'ซ่อนชื่อนักเรียนอีกครั้ง' : 'แสดงชื่อนักเรียน (ข้อมูลอ่อนไหว)'}
    >
      {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
      {revealed ? 'ซ่อนชื่อนักเรียน' : 'แสดงชื่อนักเรียน'}
    </button>
  );
}
