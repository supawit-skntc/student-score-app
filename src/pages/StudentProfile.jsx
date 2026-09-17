import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Search, FileText, UserRound, Inbox, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { callAPI } from '../services/api';
import { statusForPoints } from '../data/thresholds';
import { academicYearOf, currentAcademicYear } from '../data/academicYear';
import { isAdmin } from '../utils/permissions';

function parsePoints(points) {
  const n = parseInt(String(points).replace('-', ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// จำกัดจำนวนชิปที่แสดงพร้อมกัน — ถ้าโรงเรียนมีนักเรียนโดนตัดคะแนนหลายร้อยคน
// (ไม่ใช่แค่ไม่กี่คนซ้ำๆ เหมือนข้อมูลตัวอย่างตอนออกแบบ) รายการจะยาวจนรกจอ ต้อง
// ให้ครูพิมพ์ค้นหาให้เจาะจงขึ้นแทน
const MAX_CHIP_RESULTS = 20;

// รับ initialStudentId เผื่อมาจากปุ่ม "ดูประวัติ" ในหน้า Dashboard/Report — ถ้าไม่มี
// ก็ใช้เป็นหน้าค้นหาอิสระได้ตามปกติ
export default function StudentProfile({ initialStudentId }) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState(initialStudentId || null);
  const [currentUser, setCurrentUser] = useState(null);
  const admin = isAdmin(currentUser);

  const fetchRecords = async () => {
    setIsLoading(true);
    try {
      const result = await callAPI('getRecords', {});
      if (result.status === 'success') {
        setRecords(result.data || []);
      } else {
        Swal.fire('ข้อผิดพลาด', result.message || 'ไม่สามารถดึงข้อมูลได้', 'error');
      }
    } catch {
      Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    const stored = localStorage.getItem('currentUser');
    if (stored) setCurrentUser(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (initialStudentId) setSelectedId(initialStudentId);
  }, [initialStudentId]);

  // ลบรายการ (soft delete — เฉพาะ admin) เหมือนหน้ารายงาน — ถ้ารายการนี้ sync
  // เข้า RMS ไปแล้วต้องไปลบใน RMS เองด้วยมือ เพราะบอทไม่มีความสามารถลบข้อมูลใน RMS
  const handleDeleteRecord = (record) => {
    const alreadySynced = record.rmsSyncStatus === 'synced';
    Swal.fire({
      title: 'ลบรายการนี้?',
      html: `${record.offense}<br/>${record.displayDate}` +
        (alreadySynced
          ? '<br/><br/><span style="color:#E11D48">รายการนี้ถูกส่งเข้า RMS ไปแล้ว — การลบที่นี่จะไม่ลบข้อมูลใน RMS ให้ ต้องไปลบเองในนั้นด้วยมือ</span>'
          : ''),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#E11D48',
      cancelButtonColor: '#94A3B8',
      confirmButtonText: 'ลบรายการ',
      cancelButtonText: 'ยกเลิก',
    }).then(async (result) => {
      if (!result.isConfirmed) return;
      try {
        const res = await callAPI('deleteRecord', { id: record.id });
        if (res.status === 'success') {
          Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1200, showConfirmButton: false });
          fetchRecords();
        } else {
          Swal.fire('ข้อผิดพลาด', res.message, 'error');
        }
      } catch {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
      }
    });
  };

  const thisAcademicYear = currentAcademicYear();

  const students = useMemo(() => {
    const map = new Map();
    records.forEach((r) => {
      const prev = map.get(r.studentId) || {
        studentId: r.studentId,
        name: r.displayFullName,
        level: r.displayLevel,
        fieldOfStudy: r.fieldOfStudy,
        total: 0,
        history: [],
      };
      // คะแนนสะสมนับเฉพาะปีการศึกษาปัจจุบัน (รีเซ็ตทุกปีตามข้อ 11) แต่ history
      // เก็บทุกปีไว้ครบ เพื่อให้ยังดูประวัติย้อนหลังทั้งหมดได้จากหน้านี้
      if (academicYearOf(r.date) === thisAcademicYear) {
        prev.total += parsePoints(r.points);
      }
      prev.history.push(r);
      map.set(r.studentId, prev);
    });
    return [...map.values()]
      .map((s) => ({
        ...s,
        status: statusForPoints(s.total),
        history: [...s.history].sort((a, b) => (a.date < b.date ? 1 : -1)),
      }))
      .sort((a, b) => b.total - a.total);
  }, [records, thisAcademicYear]);

  const filtered = students.filter(
    (s) => s.studentId.includes(searchTerm) || s.name.includes(searchTerm)
  );
  const selected = students.find((s) => s.studentId === selectedId) || filtered[0] || null;

  // จัดกลุ่มประวัติตามปีการศึกษา (ปีล่าสุดก่อน) ให้เห็นชัดว่าคะแนนสะสมด้านบนนับ
  // จากปีไหน ส่วนปีก่อนหน้ายังดูประวัติได้แต่ไม่ถูกนับรวมในคะแนนสะสมแล้ว
  const historyGroups = [];
  if (selected) {
    const byYear = new Map();
    selected.history.forEach((r) => {
      const y = academicYearOf(r.date) || 0;
      if (!byYear.has(y)) byYear.set(y, []);
      byYear.get(y).push(r);
    });
    [...byYear.keys()].sort((a, b) => b - a).forEach((y) => {
      historyGroups.push({ year: y, records: byYear.get(y) });
    });
  }

  const initials = (selected?.name || '').replace(/^(นาย|นาง|นางสาว)/, '').trim().slice(0, 1) || '?';

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-9 w-9 text-brand-600 animate-spin mb-4" />
        <p className="text-ink-mute font-medium text-sm">กำลังโหลดข้อมูล...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-[900px] mx-auto">

      {/* --- ค้นหา + ชิปเลือกนักเรียน --- */}
      <div className="bg-white p-4 rounded-[20px] border border-line">
        <div className="relative mb-3">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-[18px] w-[18px] text-[#B9A5A8]" />
          </div>
          <input
            type="text"
            placeholder="ค้นหารหัสหรือชื่อนักเรียน..."
            className="w-full min-h-12 pl-[42px] pr-4 border-[1.5px] border-[#E3D9DA] rounded-[14px] focus:border-brand-500 outline-none transition text-[16px]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {searchTerm.trim() === '' ? (
          <p className="py-6 text-center text-sm text-ink-faint">พิมพ์รหัสหรือชื่อเพื่อค้นหานักเรียน</p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">ไม่พบนักเรียนที่ค้นหา</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {filtered.slice(0, MAX_CHIP_RESULTS).map((s) => {
                const active = selected?.studentId === s.studentId;
                return (
                  <button
                    key={s.studentId}
                    onClick={() => setSelectedId(s.studentId)}
                    className={`inline-flex items-center gap-2 min-h-11 rounded-[14px] pl-3.5 pr-2 text-[13.5px] font-semibold border-[1.5px] transition-colors ${
                      active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-[#EADFDF] bg-white text-ink-soft hover:bg-line-soft'
                    }`}
                  >
                    {s.name}
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-bold ${active ? 'bg-brand-600 text-white' : 'bg-line-soft text-ink-mute'}`}>
                      {s.total}
                    </span>
                  </button>
                );
              })}
            </div>
            {filtered.length > MAX_CHIP_RESULTS && (
              <p className="mt-2.5 text-xs text-ink-faint">
                พบ {filtered.length} คน — แสดง {MAX_CHIP_RESULTS} คนแรก ลองพิมพ์ให้เจาะจงขึ้นเพื่อดูคนที่ต้องการ
              </p>
            )}
          </>
        )}
      </div>

      {/* --- รายละเอียด --- */}
      {!selected ? (
        <div className="rounded-[20px] border border-line bg-white p-6">
          <div className="flex flex-col items-center gap-3 py-16 text-ink-faint">
            <Inbox size={32} strokeWidth={1.5} />
            <span className="text-sm font-medium">เลือกนักเรียนด้านบนเพื่อดูประวัติ</span>
          </div>
        </div>
      ) : (
        <>
          <div
            className="rounded-[22px] p-[22px] shadow-[0_20px_44px_-26px_rgba(56,16,26,.9)] text-white"
            style={{ background: 'radial-gradient(120% 120% at 100% 0%, #8A2E42 0%, #4A1624 60%, #38101A 100%)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-5">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-[24px] bg-white/[0.14] font-display text-[30px] font-semibold">
                  {initials}
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-[21px] font-medium truncate">{selected.name}</h2>
                  <p className="mt-1 text-[13px] text-brand-100/80">
                    {selected.fieldOfStudy} · {selected.level} · {selected.studentId}
                  </p>
                  <span className="mt-2 inline-flex items-center rounded-full bg-white/[0.14] px-3 py-1 text-[12.5px] font-semibold text-gold-50">
                    {selected.status ? `${selected.status.action} (${selected.status.ref})` : 'ปกติ — ยังไม่ถึงเกณฑ์'}
                  </span>
                </div>
              </div>

              <div className="shrink-0 min-w-[160px]">
                <p className="text-xs text-brand-100/70">คะแนนสะสม ปีการศึกษา {thisAcademicYear}</p>
                <p className="font-display text-[42px] font-semibold leading-none text-gold-300">{selected.total}</p>
                <div className="mt-2 h-1.5 w-full min-w-[140px] overflow-hidden rounded-full bg-white/[0.16]">
                  <div
                    className="h-full rounded-full bg-gold-300"
                    style={{ width: `${Math.min(100, (selected.total / 40) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-line bg-white p-[18px]">
            <h3 className="mb-4 font-display text-[15px] font-medium text-ink">
              ประวัติการถูกตัดคะแนนทั้งหมด ({selected.history.length} รายการ)
            </h3>
            {historyGroups.map((group) => (
              <div key={group.year} className="mb-5 last:mb-0">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[.04em] text-ink-faint">
                  ปีการศึกษา {group.year || 'ไม่ทราบ'}{group.year === thisAcademicYear ? ' (ปัจจุบัน — นับรวมในคะแนนสะสม)' : ' (ไม่นับรวมในคะแนนสะสมแล้ว)'}
                </p>
                <div className="flex flex-col">
                  {group.records.map((r, i) => (
                    <div key={r.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                      <div className="flex flex-col items-center shrink-0">
                        <span className="mt-1.5 h-[9px] w-[9px] rounded-full bg-brand-600 shrink-0" />
                        {i < group.records.length - 1 && <span className="w-[1.5px] flex-1 bg-[#F0E4E2] mt-1" />}
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-ink">{r.offense}</p>
                          <p className="mt-0.5 text-xs text-ink-mute">{r.displayDate} · บันทึกโดย {r.teacherName}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-bad-bg px-2.5 py-0.5 text-[13px] font-bold text-bad-fg">
                            {String(r.points).startsWith('-') ? r.points : `-${r.points}`}
                          </span>
                          {r.pdfUrl ? (
                            <a
                              href={r.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center rounded-full bg-brand-50 p-1.5 text-brand-600 transition-colors hover:bg-brand-100 hover:text-brand-700"
                              title="เปิดไฟล์ PDF"
                            >
                              <FileText size={15} />
                            </a>
                          ) : (
                            // รายการเพิ่งบันทึกใหม่ๆ PDF จะยังไม่เสร็จทันที (สร้างแบบเบื้องหลัง)
                            <span className="text-[10px] text-ink-faint" title="กำลังจัดทำเอกสาร PDF อยู่ กรุณารีเฟรชอีกครู่">กำลังจัดทำ...</span>
                          )}
                          {admin && (
                            <button
                              onClick={() => handleDeleteRecord(r)}
                              className="inline-flex items-center justify-center rounded-full bg-bad-bg p-1.5 text-bad-fg transition-colors hover:brightness-95"
                              title="ลบรายการนี้"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
