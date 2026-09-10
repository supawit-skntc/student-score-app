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

export default function SummaryCard({ label, value, meta, tone = 'ink', variant = 'plain', progress }) {
  return (
    <div className={`p-4 rounded-[18px] ${VARIANT_STYLES[variant]}`}>
      <p className={`text-[12.5px] ${LABEL_TONE[variant]}`}>{label}</p>
      <p className={`mt-1.5 font-display text-[30px] font-semibold leading-none ${VALUE_TONE[tone]}`}>{value}</p>
      {meta && <p className={`mt-1.5 text-[11.5px] ${META_TONE[variant]}`}>{meta}</p>}
      {progress != null && (
        <div className="mt-2 h-[5px] rounded-full bg-[#EDF3F0] overflow-hidden">
          <span className="block h-full rounded-full bg-ok-fg" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </div>
      )}
    </div>
  );
}
