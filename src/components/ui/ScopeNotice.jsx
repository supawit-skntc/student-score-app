import React from 'react';
import { Info } from 'lucide-react';
import { canViewAllRecords } from '../../utils/permissions';

// ครูผู้สอนเห็นเฉพาะรายการที่ตัวเองบันทึก + นักเรียนในสาขาที่ผู้ดูแลระบบกำหนดให้ (ตัดสินที่เซิร์ฟเวอร์ ดู
// isRecordVisibleTo_ ใน Service_Records.gs) — ป้ายนี้บอกขอบเขตให้ครูรู้ กันเข้าใจผิดว่าข้อมูลที่เห็นคือของทั้งวิทยาลัย
// ผู้ดูแลระบบ/กลุ่มเห็นทุกรายการไม่เห็นป้ายนี้
export default function ScopeNotice({ user }) {
  if (!user || canViewAllRecords(user)) return null;
  const majors = Array.isArray(user.majors) ? user.majors : [];
  return (
    <div className="flex items-start gap-2.5 rounded-[14px] border border-gold-200 bg-gold-50 px-3.5 py-2.5 text-[13px] text-gold-700">
      <Info size={16} className="mt-0.5 shrink-0" />
      <p>
        {majors.length > 0 ? (
          <>
            แสดงรายการที่คุณบันทึก และนักเรียนในสาขาที่คุณรับผิดชอบ: <b>{majors.join(', ')}</b>
            {' '}— คะแนนสะสมของนักเรียนนอกสาขาของคุณ นับเฉพาะรายการที่คุณบันทึก
          </>
        ) : (
          <>
            แสดงเฉพาะรายการที่คุณบันทึก — ถ้าต้องการดูนักเรียนในสาขาของคุณ ให้แจ้งผู้ดูแลระบบกำหนด "สาขาที่รับผิดชอบ" ให้บัญชีของคุณ
            (แล้วออกจากระบบและเข้าใหม่)
          </>
        )}
      </p>
    </div>
  );
}
