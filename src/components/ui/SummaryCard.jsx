import React from 'react';

const VARIANT_STYLES = {
  feature: 'bg-gradient-to-br from-brand-700 to-brand-900 text-white border border-transparent shadow-[0_12px_28px_-18px_rgba(56,16,26,.9)]',
  plain: 'bg-white border border-line',
  warn: 'bg-[#FEFAF0] border border-[#F0E1BE]',
};

const LABEL_TONE = {
  feature: 'text-brand-100/75',
  plain: 'text-ink-mute',
  warn: 'text-warn-fg/80',
};

const META_TONE = {
  feature: 'text-gold-300/95',
  plain: 'text-ink-mute',
  warn: 'text-warn-fg/80',
};

const VALUE_TONE = {
  brand: 'text-white',
  ink: 'text-ink',
  bad: 'text-bad-fg',
  ok: 'text-ok-fg',
  warn: 'text-warn-fg',
};

// onClick (ไม่บังคับ) — ถ้าส่งมาจะเรนเดอร์เป็น <button> แทน <div> เฉยๆ พร้อม
// hover/focus state ให้รู้ว่ากดได้ เช่น การ์ด "อยู่ระหว่างทัณฑ์บน" ที่กดแล้วพาไป
// ดูรายชื่อต่อได้เลย แทนที่จะเป็นแค่ตัวเลขเฉยๆ ไม่ทำอะไรได้
export default function SummaryCard({ label, value, meta, tone = 'ink', variant = 'plain', progress, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`p-4 rounded-[18px] text-left w-full ${VARIANT_STYLES[variant]} ${onClick ? 'cursor-pointer transition-transform hover:-translate-y-0.5 hover:brightness-95 active:translate-y-0' : ''}`}
    >
      <p className={`text-[12.5px] ${LABEL_TONE[variant]}`}>{label}</p>
      <p className={`mt-1.5 font-display text-[30px] font-semibold leading-none ${VALUE_TONE[tone]}`}>{value}</p>
      {meta && <p className={`mt-1.5 text-[11.5px] ${META_TONE[variant]}`}>{meta}</p>}
      {progress != null && (
        <div className="mt-2 h-[5px] rounded-full bg-[#EDF3F0] overflow-hidden">
          <span className="block h-full rounded-full bg-ok-fg" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
    </Tag>
  );
}
