import { useState } from 'react';

// เก็บรายชื่อ id ที่ "เปิดเผยชื่อจริง" ไว้ทีละแถว (เช่น การ์ดนักเรียนถึงเกณฑ์/คะแนนสะสมสูงสุดในแดชบอร์ด)
// เริ่มว่างเสมอทุกครั้งที่หน้าโหลดใหม่ — ไม่จำข้ามหน้า (ข้อมูลอ่อนไหว ซ่อนไว้ก่อนเป็นค่าเริ่มต้นเสมอ)
export function useRevealedSet() {
  const [revealedIds, setRevealedIds] = useState(() => new Set());

  const toggleReveal = (id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return [revealedIds, toggleReveal];
}
