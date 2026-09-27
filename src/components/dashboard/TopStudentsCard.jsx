import React, { useState } from 'react';
import { Users, Eye, EyeOff } from 'lucide-react';
import EmptyRow from '../ui/EmptyRow';
import { maskThaiName } from '../../utils/privacy';

export default function TopStudentsCard({ topStudents, thisAcademicYear, onViewStudent }) {
  // ปิดบังชื่อทีละแถวแทนสวิตช์รวมหน้าเดียว (ฟีดแบ็กผู้ใช้ 28/9/69) — ซ่อนไว้ก่อนเสมอทุกครั้งที่
  // เปิดหน้านี้ใหม่ (ไม่จำข้ามหน้า) เหมือนตัวเดิม แค่ย้ายปุ่มดวงตาไปติดท้ายชื่อแต่ละคนแทน
  const [revealedIds, setRevealedIds] = useState(() => new Set());
  const toggleReveal = (studentId) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  };

  return (
    <div className="bg-white p-[18px] rounded-[20px] border border-line">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-bad-bg text-bad-fg">
          <Users size={16} strokeWidth={2.25} />
        </div>
        <div>
          <h2 className="font-display text-[15px] font-medium text-ink">คะแนนสะสมสูงสุด</h2>
          <p className="text-xs text-ink-mute mt-0.5">ปีการศึกษา {thisAcademicYear}</p>
        </div>
      </div>

      {topStudents.length === 0 ? (
        <EmptyRow text="ยังไม่มีข้อมูลรายการตัดคะแนน" />
      ) : (
        <div className="flex flex-col">
          {topStudents.map(([studentId, s], i) => (
            <div
              key={studentId}
              className="flex w-full items-center gap-3 py-2.75 border-t border-line-soft first:border-t-0"
            >
              <button
                type="button"
                onClick={() => onViewStudent && onViewStudent(studentId)}
                disabled={!onViewStudent}
                className="flex flex-1 min-w-0 items-center gap-3 text-left transition-colors hover:bg-line-soft disabled:hover:bg-transparent rounded-lg -m-1 p-1"
              >
                <span className="w-6 shrink-0 font-display text-[13px] font-semibold text-[#B9A5A8]">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">
                    {revealedIds.has(studentId) ? s.name : maskThaiName(s.name)}
                  </p>
                  <p className="text-[11.5px] text-ink-mute">{s.count} รายการ</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => toggleReveal(studentId)}
                className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-line-soft hover:text-ink-soft transition-colors"
                title={revealedIds.has(studentId) ? 'ซ่อนชื่อ' : 'แสดงชื่อ'}
              >
                {revealedIds.has(studentId) ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <span
                className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  s.total >= 20 ? 'bg-bad-bg text-bad-fg' : 'bg-line-soft text-ink-soft'
                }`}
              >
                -{s.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
