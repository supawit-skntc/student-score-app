import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// ตัวแบ่งหน้าแบบใช้ร่วมกัน (Report.jsx, AuditLog.jsx) — เดิมทั้ง 2 หน้าแสดง
// รายการทั้งหมดยาวเดียวไม่มีการแบ่งหน้าเลย พอมีข้อมูลสะสมเยอะๆ (โรงเรียนเปิดมา
// หลายเดือน) หน้าจะยาวมาก ต้องเลื่อนดูนานกว่าจะเจอรายการที่ต้องการ
//
// สร้างเลขหน้าแบบมีจุดไข่ปลา (…) เมื่อหน้าทั้งหมดเยอะ แทนที่จะแสดงทุกเลขหน้า —
// เก็บหน้าแรก/หน้าสุดท้าย/หน้าปัจจุบัน ±1 ไว้เสมอ
function buildPageList(page, totalPages) {
  const pages = [];
  const keep = new Set([1, totalPages, page - 1, page, page + 1]);
  for (let p = 1; p <= totalPages; p++) {
    if (keep.has(p) && p >= 1 && p <= totalPages) pages.push(p);
  }
  const withGaps = [];
  let prev = 0;
  for (const p of pages) {
    if (prev && p - prev > 1) withGaps.push('…');
    withGaps.push(p);
    prev = p;
  }
  return withGaps;
}

// page: เลขหน้าปัจจุบัน (เริ่มที่ 1) — pageSize: จำนวนรายการต่อหน้า — total: จำนวน
// รายการทั้งหมด (ก่อนแบ่งหน้า) — onPageChange(newPage)
export default function Pagination({ page, pageSize, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pageList = buildPageList(page, totalPages);

  const go = (p) => {
    if (p < 1 || p > totalPages || p === page) return;
    onPageChange(p);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-[16px] border border-line px-4 py-3">
      <p className="text-xs text-ink-faint">
        แสดง <b className="text-ink-mute font-semibold">{from}-{to}</b> จาก <b className="text-ink-mute font-semibold">{total}</b> รายการ
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => go(page - 1)}
          disabled={page === 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border-[1.5px] border-[#EADFDF] text-ink-soft disabled:opacity-35 disabled:pointer-events-none hover:bg-line-soft transition-colors"
          aria-label="หน้าก่อนหน้า"
        >
          <ChevronLeft size={16} />
        </button>

        {/* เลขหน้า — ซ่อนบนมือถือ (จอแคบ) เหลือแค่ปุ่มก่อนหน้า/ถัดไป + ตัวเลขบอกหน้าปัจจุบัน */}
        <div className="hidden sm:flex items-center gap-1">
          {pageList.map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="w-9 text-center text-sm text-ink-faint">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => go(p)}
                className={`inline-flex h-9 min-w-9 items-center justify-center rounded-[10px] px-2 text-[13px] font-semibold transition-colors ${
                  p === page ? 'bg-brand-600 text-white' : 'text-ink-soft hover:bg-line-soft'
                }`}
              >
                {p}
              </button>
            )
          )}
        </div>
        <span className="sm:hidden text-[13px] font-semibold text-ink-soft px-1">
          {page} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => go(page + 1)}
          disabled={page === totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border-[1.5px] border-[#EADFDF] text-ink-soft disabled:opacity-35 disabled:pointer-events-none hover:bg-line-soft transition-colors"
          aria-label="หน้าถัดไป"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
