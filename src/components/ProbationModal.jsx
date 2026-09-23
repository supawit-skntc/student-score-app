import React, { useState } from 'react';
import { Loader2, X, ShieldAlert } from 'lucide-react';
import Swal from 'sweetalert2';
import { callAPI } from '../services/api';
import { todayLocalISO } from '../utils/date';

// ป๊อปอัปบันทึกทัณฑ์บน — ใช้ร่วมกันทุกหน้าที่ต้องการ (แดชบอร์ด/ประวัตินักเรียน ฯลฯ)
// แทนที่จะเขียนฟอร์มซ้ำแยกแต่ละหน้า — เดิมมีแค่ในหน้า "ประวัตินักเรียน" หน้าเดียว
// ทำให้ต้องค้นหา + เลือกนักเรียนเองก่อนถึงจะบันทึกได้ ทั้งที่เจ้าหน้าที่มักเห็นอยู่
// แล้วว่าใครต้องทำ (เช่น จากการ์ด "นักเรียนที่ถึงเกณฑ์" ในแดชบอร์ด) ไม่ควรต้องไป
// ค้นหาซ้ำอีกรอบ (ฟีดแบ็กจากผู้ใช้งานจริง: หาปุ่มไม่เจอ + ขั้นตอนเยอะเกินไป) —
// รับแค่ student ({studentId, studentName}) มาจากหน้าไหนก็ได้
export default function ProbationModal({ student, onClose, onSaved }) {
  const [date, setDate] = useState(todayLocalISO());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await callAPI('addProbationRecord', {
        data: { studentId: student.studentId, studentName: student.studentName, date, note },
      });
      if (result.status === 'success') {
        Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1200, showConfirmButton: false });
        if (onSaved) onSaved();
        onClose();
      } else {
        Swal.fire('ข้อผิดพลาด', result.message, 'error');
      }
    } catch {
      Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-[24px] sm:rounded-[22px] shadow-modal w-full max-w-[420px] max-h-[90vh] overflow-y-auto">

        <div className="sticky top-0 z-10 bg-white border-b border-line-soft p-5 flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-bad-bg text-bad-fg">
              <ShieldAlert size={17} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-[16px] font-medium text-ink">บันทึกทัณฑ์บน</h2>
              <p className="text-[12.5px] text-ink-mute mt-0.5 truncate">{student.studentName} · {student.studentId}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-line-soft text-ink-mute transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* คำอธิบายสั้นๆ ว่าปุ่มนี้ทำอะไร — เดิมไม่มีเลย ทำให้ผู้ใช้งานที่เจอ
              ฟีเจอร์นี้ครั้งแรกไม่แน่ใจว่ากดแล้วจะกระทบคะแนนสะสมไหม */}
          <p className="rounded-[13px] bg-gold-50 px-3.5 py-2.5 text-[12.5px] text-gold-700">
            บันทึกนี้ <b>ไม่กระทบคะแนนสะสม</b> ของนักเรียนเลย — แค่เก็บไว้เป็นประวัติถาวรว่าเคยเชิญผู้ปกครองมาทำทัณฑ์บนแล้ว
            ต่างจากคะแนนสะสมที่รีเซ็ตทุกปีการศึกษา ป้ายนี้จะติดตัวนักเรียนไปตลอดไม่ถูกลบ
          </p>

          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ink-soft">วันที่ทำทัณฑ์บน</label>
            <input
              type="date" required value={date} onChange={(e) => setDate(e.target.value)}
              className="min-h-12 w-full rounded-[13px] border-[1.5px] border-[#E3D9DA] bg-field px-3.5 py-3 text-[16px] outline-none transition focus:border-brand-500 focus:bg-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-ink-soft">หมายเหตุ (ถ้ามี)</label>
            <input
              type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น คะแนนสะสมครบ 20 คะแนน"
              className="min-h-12 w-full rounded-[13px] border-[1.5px] border-[#E3D9DA] bg-field px-3.5 py-3 text-[16px] outline-none transition focus:border-brand-500 focus:bg-white"
            />
          </div>

          <div className="mt-1 flex gap-3 pt-4 border-t border-line-soft">
            <button
              type="button" onClick={onClose}
              className="flex-1 min-h-[50px] rounded-[15px] border border-line text-ink-soft font-semibold hover:bg-line-soft transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 min-h-[50px] rounded-[15px] bg-gradient-to-b from-brand-600 to-brand-700 text-white font-display font-medium hover:from-brand-500 hover:to-brand-600 flex items-center justify-center gap-2 transition-colors disabled:from-brand-400 disabled:to-brand-400"
            >
              {saving ? <Loader2 className="animate-spin" size={19} /> : null}
              {saving ? 'กำลังบันทึก...' : 'ยืนยันบันทึก'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
