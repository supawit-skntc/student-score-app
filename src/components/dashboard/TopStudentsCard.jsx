import React from 'react';
import { Users } from 'lucide-react';
import EmptyRow from '../ui/EmptyRow';

export default function TopStudentsCard({ topStudents, thisAcademicYear, onViewStudent }) {
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
            <button
              key={studentId}
              onClick={() => onViewStudent && onViewStudent(studentId)}
              disabled={!onViewStudent}
              className="flex w-full items-center gap-3 py-2.75 border-t border-line-soft first:border-t-0 text-left transition-colors hover:bg-line-soft disabled:hover:bg-transparent"
            >
              <span className="w-6 shrink-0 font-display text-[13px] font-semibold text-[#B9A5A8]">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink truncate">{s.name}</p>
                <p className="text-[11.5px] text-ink-mute">{s.count} รายการ</p>
              </div>
              <span
                className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  s.total >= 20 ? 'bg-bad-bg text-bad-fg' : 'bg-line-soft text-ink-soft'
                }`}
              >
                -{s.total}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
