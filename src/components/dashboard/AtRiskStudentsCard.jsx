import React, { useState } from 'react';
import { ShieldAlert, Copy, Check } from 'lucide-react';

const SCORE_BOX_CLS = {
  notice: 'bg-gold-50 text-gold-700',
  warn: 'bg-warn-bg text-warn-fg',
  critical: 'bg-bad-bg text-bad-fg',
};

const ACTION_PILL_CLS = {
  notice: 'bg-gold-50 text-gold-700',
  warn: 'bg-warn-bg text-warn-fg',
  critical: 'bg-bad-bg text-bad-fg',
};

// ตัวกรองระดับคะแนน — เพิ่มเข้ามาแทนที่จะสร้างวิดเจ็ตแยกต่างหากสำหรับ "≥20 คะแนน
// เข้าค่ายปรับเปลี่ยนพฤติกรรม" เพราะข้อมูลชุดเดียวกับที่การ์ดนี้แสดงอยู่แล้ว
const FILTER_OPTIONS = [
  { key: 'all', label: 'ทั้งหมด', min: 0 },
  { key: '15', label: '≥ 15 คะแนน', min: 15 },
  { key: '20', label: '≥ 20 คะแนน (เข้าค่ายปรับเปลี่ยนพฤติกรรม)', min: 20 },
  { key: '30', label: '≥ 30 คะแนน', min: 30 },
];

// รายชื่อนักเรียนที่คะแนนสะสมถึงเกณฑ์ต้องดำเนินการตามระเบียบข้อ 8.3
export default function AtRiskStudentsCard({ students, thisAcademicYear, onViewStudent }) {
  const [filterKey, setFilterKey] = useState('all');
  const [copied, setCopied] = useState(false);

  if (students.length === 0) return null;

  const activeFilter = FILTER_OPTIONS.find((f) => f.key === filterKey);
  const filtered = students.filter((s) => s.total >= activeFilter.min);

  // คัดลอกรายชื่อ (พร้อมคะแนน) ไปวางต่อในเอกสารสรุปรายชื่อเข้าค่ายได้เลย
  const handleCopy = async () => {
    const text = filtered.map((s) => `${s.name} (${s.total} คะแนน)`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // เงียบไว้ — บางบริบท (เช่นไม่ใช่ HTTPS) เบราว์เซอร์อาจไม่อนุญาตให้ copy
    }
  };

  return (
    <div className="bg-white p-[18px] rounded-[20px] border border-line">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bad-bg text-bad-fg">
            <ShieldAlert size={16} strokeWidth={2.25} />
          </div>
          <div>
            <h2 className="font-display text-[15px] font-medium text-ink">นักเรียนที่ถึงเกณฑ์ต้องดำเนินการ</h2>
            <p className="text-xs text-ink-mute mt-0.5">ตามระเบียบข้อ 8.3 · คะแนนสะสมปีการศึกษา {thisAcademicYear}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center rounded-full bg-bad-bg text-bad-fg px-3 py-1 text-[12.5px] font-bold">
            {filtered.length} คน
          </span>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-mute hover:bg-line-soft transition-colors"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'คัดลอกแล้ว' : 'คัดลอกรายชื่อ'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-1">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterKey(f.key)}
            className={`rounded-[13px] px-3 py-1.5 text-xs font-semibold border transition-colors ${
              filterKey === f.key
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-[#EADFDF] bg-white text-ink-soft hover:bg-line-soft'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">ไม่มีนักเรียนที่ตรงตามเกณฑ์นี้</p>
      ) : (
        <div className="divide-y divide-line-soft">
          {filtered.map((s) => (
            <div key={s.studentId} className="flex flex-wrap items-center gap-3.5 py-3.5">
              <div className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[17px] font-display text-[19px] font-semibold ${SCORE_BOX_CLS[s.status.tone]}`}>
                {s.total}
              </div>
              <div className="flex-1 min-w-[150px]">
                <p className="text-[14.5px] font-semibold text-ink truncate">{s.name}</p>
                <p className="mt-0.5 text-xs text-ink-mute">{s.count} รายการ</p>
                <span className={`mt-1.5 inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${ACTION_PILL_CLS[s.status.tone]}`}>
                  {s.status.action} ({s.status.ref})
                </span>
              </div>
              {onViewStudent && (
                <button
                  onClick={() => onViewStudent(s.studentId)}
                  className="shrink-0 min-h-10 px-4 rounded-xl border border-line bg-white text-sm font-semibold text-brand-600 hover:bg-brand-50 hover:border-brand-200 transition-colors"
                >
                  ดูประวัติ
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-ink-faint">
        * นับคะแนนสะสมเฉพาะปีการศึกษา {thisAcademicYear} เท่านั้น — จะรีเซ็ตอัตโนมัติเมื่อขึ้นปีการศึกษาใหม่ตามข้อ 11
      </p>
    </div>
  );
}
