import React from 'react';
import { Cpu, Loader2 } from 'lucide-react';
import EmptyRow from '../ui/EmptyRow';

function formatRelativeTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}

function RpaStat({ label, value, tone }) {
  const toneCls = {
    good: 'text-ok-fg',
    warn: 'text-warn-fg',
    bad: 'text-bad-fg',
  }[tone] || 'text-ink';

  return (
    <div>
      <p className="text-xs font-medium text-ink-mute mb-1">{label}</p>
      <p className={`font-display text-lg font-semibold ${toneCls}`}>{value}</p>
    </div>
  );
}

// สถานะ RPA Bot จากข้อมูลจริงในชีต RPA_Log — รายละเอียดเชิงปฏิบัติการ ให้เฉพาะ
// admin เห็น (Dashboard.jsx เป็นคนตัดสินใจว่าจะ render การ์ดนี้หรือไม่)
export default function RpaBotCard({ rpaStats, rpaLoading }) {
  return (
    <div className="bg-white p-[18px] rounded-[20px] border border-line">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand-50 text-brand-700">
          <Cpu size={16} strokeWidth={2.25} />
        </div>
        <h2 className="font-display text-[15px] font-medium text-ink">
          สถานะ RPA Bot → RMS <span className="text-xs font-normal text-ink-faint">(เฉพาะผู้ดูแลระบบ)</span>
        </h2>
      </div>

      {rpaLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 text-brand-600 animate-spin" />
        </div>
      ) : !rpaStats || !rpaStats.hasLogs ? (
        <EmptyRow text={`คิวรอดำเนินการ ${rpaStats?.pendingCount ?? 0} รายการ — ยังไม่มีประวัติการทำงานของบอท จะเริ่มบันทึกสถิติเมื่อประมวลผลรายการแรก`} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <RpaStat label="คิวรอดำเนินการ" value={`${rpaStats.pendingCount} รายการ`} />
            <RpaStat label="รันล่าสุด" value={formatRelativeTime(rpaStats.lastRunAt)} />
            <RpaStat
              label="อัตราความสำเร็จ"
              value={`${rpaStats.successRate}%`}
              tone={rpaStats.successRate >= 90 ? 'good' : rpaStats.successRate >= 70 ? 'warn' : 'bad'}
            />
            <RpaStat
              label="เวลาเฉลี่ย/รายการ"
              value={rpaStats.avgDurationSeconds != null ? `${rpaStats.avgDurationSeconds} วินาที` : '-'}
            />
          </div>

          {rpaStats.recentDurations.length > 0 && (
            <div className="mt-5">
              <p className="text-xs text-ink-faint mb-2">เวลาที่ใช้ต่อรายการ ({rpaStats.recentDurations.length} รายการล่าสุด)</p>
              <div className="flex items-end gap-1.5 h-10">
                {rpaStats.recentDurations.map((d, i) => {
                  const max = Math.max(...rpaStats.recentDurations);
                  return (
                    <div
                      key={i}
                      className="flex-1 bg-gold-400 rounded-t"
                      style={{ height: `${Math.max(10, (d / max) * 100)}%` }}
                      title={`${d} วินาที`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <p className="mt-4 text-xs text-ink-faint">
            จากประวัติทั้งหมด {rpaStats.totalRuns} ครั้งที่บอทเคยรัน (ดูรายละเอียดทุกครั้งได้ที่ชีต RPA_Log)
          </p>
        </>
      )}
    </div>
  );
}
