import React from 'react';
import { ClipboardList } from 'lucide-react';
import EmptyRow from '../ui/EmptyRow';

export default function TopOffensesCard({ topOffenses, maxOffenseCount }) {
  return (
    <div className="bg-white p-[18px] rounded-[20px] border border-line">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-50 text-brand-700">
          <ClipboardList size={16} strokeWidth={2.25} />
        </div>
        <h2 className="font-display text-[15px] font-medium text-ink">ฐานความผิดที่พบบ่อยที่สุด</h2>
      </div>

      {topOffenses.length === 0 ? (
        <EmptyRow text="ยังไม่มีข้อมูลรายการตัดคะแนน" />
      ) : (
        <div className="space-y-3.5">
          {topOffenses.map(([offense, count], i) => (
            <div key={offense}>
              <div className="flex justify-between text-[13.5px] mb-1.5">
                <span className="text-ink font-medium">{offense}</span>
                <span className="text-brand-700 font-bold">{count} ครั้ง</span>
              </div>
              <div className="h-2 rounded-full bg-line-soft overflow-hidden">
                <div
                  className={`h-full rounded-full ${i === 0 ? 'bg-gradient-to-r from-brand-500 to-gold-500' : 'bg-brand-400'}`}
                  style={{ width: `${Math.max(6, (count / maxOffenseCount) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
