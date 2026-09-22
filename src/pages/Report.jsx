import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Search, SlidersHorizontal, FileText, Edit, Inbox, UserRound, Trash2, Download } from 'lucide-react';
import Swal from 'sweetalert2';
import { callAPI } from '../services/api';
import { CACHED_OFFENSES, fetchOffenses, findOffense } from '../data/offenses';
import { isAdmin, canViewAllRecords } from '../utils/permissions';
import { academicYearOf, currentAcademicYear } from '../data/academicYear';
import { downloadCsv } from '../utils/csv';
import { todayLocalISO } from '../utils/date';
import EditRecordModal from '../components/EditRecordModal';

function parsePoints(points) {
  const n = parseInt(String(points).replace('-', ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// text-[16px] (ไม่ใช่ 13px) เพราะเป็นฟอนต์ของ <select>/<input type="date"> จริง
// — ต่ำกว่า 16px iOS Safari จะซูมจอเข้าอัตโนมัติทุกครั้งที่แตะโฟกัสบนมือถือ
const filterCls = "min-h-[42px] rounded-[13px] border-[1.5px] border-[#EADFDF] px-3 text-[16px] font-semibold outline-none focus:border-brand-500 bg-white text-ink-soft";
const chipCls = (active) => `min-h-[42px] rounded-[13px] px-3.5 text-[13px] font-semibold border-[1.5px] transition-colors ${
  active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-[#EADFDF] bg-white text-ink-soft hover:bg-line-soft'
}`;

// สถานะ sync เข้าระบบ RMS (rmsSyncStatus จาก getRecords) — ข้อมูลนี้มีอยู่แล้วจาก
// backend แต่เดิมหน้านี้ไม่เคยแสดงให้ครูเห็นเลยว่ารายการที่บันทึกไปแล้วเข้า RMS
// จริงหรือยัง
const SYNC_STATUS_MAP = {
  pending: { label: 'รอส่งเข้า RMS', cls: 'bg-gold-50 text-gold-700' },
  synced: { label: 'เข้า RMS แล้ว', cls: 'bg-ok-bg text-ok-fg' },
  needs_review: { label: 'ต้องตรวจสอบ', cls: 'bg-warn-bg text-warn-fg' },
  error: { label: 'ผิดพลาด', cls: 'bg-bad-bg text-bad-fg' },
};

export default function Report({ onViewStudent }) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const admin = isAdmin(currentUser);
  const seesAllRecords = canViewAllRecords(currentUser);
  const [filterLevel, setFilterLevel] = useState("");
  const [filterMajor, setFilterMajor] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterHighRisk, setFilterHighRisk] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // State สำหรับเก็บข้อมูลในหน้าต่างแก้ไข
  const [editingRecord, setEditingRecord] = useState(null);

  // รายการฐานความผิด — เซิร์ฟเวอร์เป็นเจ้าของข้อมูลจริงที่เดียวแล้ว (ดู
  // src/data/offenses.js) เริ่มด้วยค่าที่แคชไว้จากรอบก่อน กันหน้าแก้ไขว่างช่วง
  // รอ fetch — EditRecordModal รับต่อผ่าน prop ด้านล่าง
  //
  // ⚠️ offensesReady ต้องรอ fetchOffenses() เสร็จก่อนเสมอ ก่อนอนุญาตให้เปิดหน้าต่าง
  // แก้ไข (ดู openEditModal ด้านล่าง) — ถ้าเปิดตอน offenses ยังว่างอยู่ (เช่น
  // เบราว์เซอร์ใหม่ที่ยังไม่มีแคชใน localStorage และ fetch ยังไม่เสร็จ)
  // offenseOptions จะว่างไปด้วย ทำให้ทุกรายการถูกเข้าใจผิดว่าเป็น "อื่นๆ" ทั้งหมด
  // ถ้าครูกดบันทึกโดยไม่สังเกต จะเขียนทับฐานความผิดจริงในชีตด้วยข้อความผิดถาวร
  const [offenses, setOffenses] = useState(CACHED_OFFENSES);
  const [offensesReady, setOffensesReady] = useState(CACHED_OFFENSES.length > 0);
  const offenseOptions = offenses.map((o) => o.label);

  useEffect(() => {
    fetchData();
    fetchOffenses().then((data) => { setOffenses(data); setOffensesReady(true); });
    const stored = localStorage.getItem('currentUser');
    if (stored) setCurrentUser(JSON.parse(stored));
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // ใช้ getMyRecords แทน getRecords — admin เห็นทุกรายการเหมือนเดิม ส่วนครู
      // ทั่วไปเห็นเฉพาะรายการที่ตัวเองบันทึก (กรองฝั่งเซิร์ฟเวอร์ ไม่ใช่ฝั่งเว็บ)
      const result = await callAPI('getMyRecords', {});
      if (result.status === 'success') {
        setRecords(result.data);
      } else {
        Swal.fire('ข้อผิดพลาด', result.message || 'ไม่สามารถดึงข้อมูลได้', 'error');
      }
    } catch {
      Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // เปิดหน้าต่างแก้ไข พร้อมแยกส่วนฐานความผิด
  const openEditModal = (record) => {
    // กันไว้อีกชั้น (นอกจากปุ่ม "แก้ไข" ที่ disabled ไว้แล้วระหว่างรอ) เผื่อถูกเรียก
    // ก่อน offenses โหลดเสร็จไม่ว่าด้วยเหตุผลใด — ดีกว่าเดาผิดแล้วบันทึกทับข้อมูลจริง
    if (!offensesReady) {
      Swal.fire('กรุณารอสักครู่', 'กำลังโหลดรายการฐานความผิด ลองใหม่อีกครั้ง', 'info');
      return;
    }

    let mainOffense = record.offense;
    let otherOffense = "";

    if (record.offense && record.offense.startsWith("อื่นๆ:")) {
      mainOffense = "อื่นๆ";
      otherOffense = record.offense.replace("อื่นๆ: ", "").trim();
    } else if (!offenseOptions.includes(record.offense)) {
      mainOffense = "อื่นๆ";
      otherOffense = record.offense;
    }

    setEditingRecord({
      ...record,
      mainOffense: mainOffense,
      // 🔧 String(...) ป้องกันพังกรณี GAS ส่ง points กลับมาเป็น number ไม่ใช่ string
      points: String(record.points),
      otherOffense: otherOffense
    });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    if (name === "mainOffense") {
      // เปลี่ยนฐานความผิดแล้วเติมคะแนนให้อัตโนมัติตามระเบียบข้อ 11 เช่นเดียวกับ
      // ฟอร์มบันทึก (ยังแก้ไขเองได้เผื่อกรณีที่ระเบียบเปิดช่องให้ใช้ดุลยพินิจ)
      const entry = findOffense(offenses, value);
      setEditingRecord({
        ...editingRecord,
        mainOffense: value,
        otherOffense: value === "อื่นๆ" ? editingRecord.otherOffense : "",
        points: entry && entry.points != null ? String(entry.points) : editingRecord.points,
      });
    } else {
      setEditingRecord({ ...editingRecord, [name]: value });
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();

    let finalOffense = editingRecord.mainOffense;
    if (finalOffense === "อื่นๆ") {
      if (!editingRecord.otherOffense) {
        Swal.fire('แจ้งเตือน', 'กรุณาระบุรายละเอียดความผิดอื่นๆ', 'warning');
        return;
      }
      finalOffense = `อื่นๆ: ${editingRecord.otherOffense}`;
    }

    setIsLoading(true);
    try {
      const updatedData = {
        ...editingRecord,
        offense: finalOffense,
      };

      const result = await callAPI('updateRecord', { data: updatedData });

      if (result.status === 'success') {
        Swal.fire({
          icon: 'success',
          title: 'สำเร็จ!',
          text: result.message,
          timer: 2000,
          showConfirmButton: false
        });
        setEditingRecord(null);
        fetchData();
      } else {
        Swal.fire('ข้อผิดพลาด', result.message, 'error');
      }
    } catch {
      Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // ลบรายการ (soft delete — เฉพาะ admin) ตัวข้อมูลยังอยู่ในชีตเพื่อรักษาประวัติ
  // แค่ไม่แสดงในหน้านี้อีก ถ้ารายการนี้ sync เข้า RMS ไปแล้วต้องไปลบใน RMS เอง
  // ด้วยมือ เพราะบอทไม่มีความสามารถลบข้อมูลใน RMS
  const handleDeleteRecord = (record) => {
    const alreadySynced = record.rmsSyncStatus === 'synced';
    Swal.fire({
      title: 'ลบรายการนี้?',
      html: `<b>${record.displayFullName}</b><br/>${record.offense} · ${record.displayDate}` +
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
          fetchData();
        } else {
          Swal.fire('ข้อผิดพลาด', res.message, 'error');
        }
      } catch {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
      }
    });
  };

  const majorOptions = useMemo(
    () => [...new Set(records.map((r) => r.fieldOfStudy).filter(Boolean))].sort(),
    [records]
  );

  // คะแนนสะสมปีการศึกษาปัจจุบันของแต่ละนักเรียน — ใช้กับตัวกรอง "≥20 คะแนน"
  // ⚠️ คำนวณจากรายการที่โหลดมาในหน้านี้เท่านั้น ถ้าเป็นครูทั่วไป (ไม่ใช่ admin)
  // จะเห็นแค่รายการที่ตัวเองบันทึก ยอดสะสมตรงนี้จึงอาจไม่ใช่ยอดรวมจริงของนักเรียน
  // คนนั้น (ถ้าครูคนอื่นก็เคยตัดคะแนนนักเรียนคนเดียวกันไว้ด้วย) — อยากได้ยอดสะสม
  // จริงครบทุกคนที่บันทึก ให้ดูที่หน้า "ประวัตินักเรียน" หรือ "แผงควบคุม" แทน
  const thisAcademicYear = currentAcademicYear();
  const studentTotals = useMemo(() => {
    const map = new Map();
    records.forEach((r) => {
      if (academicYearOf(r.date) !== thisAcademicYear) return;
      map.set(r.studentId, (map.get(r.studentId) || 0) + parsePoints(r.points));
    });
    return map;
  }, [records, thisAcademicYear]);

  const hasActiveFilters = filterLevel || filterMajor || filterFrom || filterTo || filterHighRisk;
  const clearFilters = () => {
    setFilterLevel("");
    setFilterMajor("");
    setFilterFrom("");
    setFilterTo("");
    setFilterHighRisk(false);
  };

  const filteredRecords = records.filter((record) => {
    const matchesSearch =
      record.studentId.includes(searchTerm) ||
      record.displayFullName.includes(searchTerm) ||
      record.offense.includes(searchTerm);
    const matchesLevel = !filterLevel || record.level === filterLevel;
    const matchesMajor = !filterMajor || record.fieldOfStudy === filterMajor;
    const matchesFrom = !filterFrom || record.date >= filterFrom;
    const matchesTo = !filterTo || record.date <= filterTo;
    const matchesHighRisk = !filterHighRisk || (studentTotals.get(record.studentId) || 0) >= 20;
    return matchesSearch && matchesLevel && matchesMajor && matchesFrom && matchesTo && matchesHighRisk;
  });

  // ส่งออกเฉพาะรายการที่กำลังเห็นอยู่บนจอ (ตรงกับตัวกรอง/คำค้นหาปัจจุบัน) — ทำ
  // ทั้งหมดที่ฝั่งเบราว์เซอร์จากข้อมูลที่โหลดมาอยู่แล้ว ไม่ต้องยิง request ใหม่
  //
  // รายงานนี้ 1 แถว = 1 ครั้งที่ถูกบันทึก (ไม่รวมคะแนน) — เหมาะกับดูรายละเอียด/
  // หลักฐานย้อนหลังเป็นรายครั้ง ถ้าอยากได้ยอดรวมต่อคนแบบไม่ซ้ำชื่อ ใช้ปุ่ม
  // "ส่งออกสรุปรายชื่อ" (handleExportSummaryCsv) แทน
  const handleExportCsv = () => {
    const headers = ['วันที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ระดับชั้น', 'สาขาวิชา', 'ฐานความผิด', 'คะแนนที่ถูกหัก', 'สถานะ RMS', 'ผู้บันทึก'];
    const rows = filteredRecords.map((r) => [
      r.displayDate,
      r.studentId,
      r.displayFullName,
      r.displayLevel,
      r.fieldOfStudy,
      r.offense,
      String(r.points).startsWith('-') ? r.points : `-${r.points}`,
      SYNC_STATUS_MAP[r.rmsSyncStatus]?.label || '-',
      r.teacherName,
    ]);
    downloadCsv(`รายงานตัดคะแนน_${todayLocalISO()}.csv`, headers, rows);
  };

  // รวม 1 นักเรียน = 1 แถว (รวมคะแนนที่ถูกหักทุกครั้งเข้าด้วยกัน) — แก้ปัญหาที่
  // รายงานแบบละเอียดด้านบนมีชื่อซ้ำกันหลายแถวเวลานักเรียนคนเดียวโดนบันทึกหลาย
  // ครั้ง ทำให้ดูภาพรวมยาก เรียงจากคะแนนรวมมากไปน้อย ให้เห็นนักเรียนกลุ่มเสี่ยง
  // (โดนหักคะแนนสะสมเยอะ) ขึ้นก่อนทันที
  const handleExportSummaryCsv = () => {
    const summaryByStudent = new Map();
    filteredRecords.forEach((r) => {
      const existing = summaryByStudent.get(r.studentId);
      if (existing) {
        existing.totalPoints += parsePoints(r.points);
        existing.count += 1;
      } else {
        summaryByStudent.set(r.studentId, {
          displayFullName: r.displayFullName,
          displayLevel: r.displayLevel,
          fieldOfStudy: r.fieldOfStudy,
          totalPoints: parsePoints(r.points),
          count: 1,
        });
      }
    });

    const headers = ['รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ระดับชั้น', 'สาขาวิชา', 'จำนวนครั้งที่ถูกบันทึก', 'คะแนนรวมที่ถูกหัก'];
    const rows = Array.from(summaryByStudent.entries())
      .sort((a, b) => b[1].totalPoints - a[1].totalPoints)
      .map(([studentId, s]) => [
        studentId,
        s.displayFullName,
        s.displayLevel,
        s.fieldOfStudy,
        String(s.count),
        `-${s.totalPoints}`,
      ]);
    downloadCsv(`สรุปคะแนนตามรายชื่อ_${todayLocalISO()}.csv`, headers, rows);
  };

  return (
    <div className="flex flex-col gap-4">

      {/* --- Search + filters card --- */}
      <div className="bg-white p-4 rounded-[20px] border border-line">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-[18px] w-[18px] text-[#B9A5A8]" />
            </div>
            <input
              type="text"
              placeholder="ค้นหารหัส, ชื่อ, ความผิด..."
              className="w-full min-h-12 pl-[42px] pr-4 border-[1.5px] border-[#E3D9DA] rounded-[14px] focus:border-brand-500 outline-none transition text-[16px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 min-h-12 px-4 rounded-[14px] border-[1.5px] text-sm font-semibold transition-colors ${
              filtersOpen || hasActiveFilters ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-[#E3D9DA] bg-white text-ink-soft'
            }`}
          >
            <SlidersHorizontal size={16} />
            ตัวกรอง
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRecords.length === 0}
            title="1 แถว = 1 ครั้งที่ถูกบันทึก เหมาะกับดูรายละเอียด/หลักฐานย้อนหลัง"
            className="inline-flex items-center gap-1.5 min-h-12 px-4 rounded-[14px] border-[1.5px] border-[#E3D9DA] bg-white text-sm font-semibold text-ink-soft transition-colors hover:bg-line-soft disabled:opacity-40 disabled:hover:bg-white"
          >
            <Download size={16} />
            ส่งออกรายละเอียด
          </button>
          <button
            type="button"
            onClick={handleExportSummaryCsv}
            disabled={filteredRecords.length === 0}
            title="1 แถว = 1 นักเรียน (รวมคะแนนที่ถูกหักทุกครั้งเข้าด้วยกัน)"
            className="inline-flex items-center gap-1.5 min-h-12 px-4 rounded-[14px] border-[1.5px] border-[#E3D9DA] bg-white text-sm font-semibold text-ink-soft transition-colors hover:bg-line-soft disabled:opacity-40 disabled:hover:bg-white"
          >
            <Download size={16} />
            ส่งออกสรุปรายชื่อ
          </button>
          <span className="text-sm text-ink-mute font-medium shrink-0">
            พบ <b className="text-ink font-bold">{filteredRecords.length}</b> รายการ
          </span>
        </div>

        {filtersOpen && (
          <div className="mt-3 pt-3 border-t border-line-soft flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setFilterLevel(filterLevel === 'ปวช.' ? '' : 'ปวช.')} className={chipCls(filterLevel === 'ปวช.')}>ปวช.</button>
            <button type="button" onClick={() => setFilterLevel(filterLevel === 'ปวส.' ? '' : 'ปวส.')} className={chipCls(filterLevel === 'ปวส.')}>ปวส.</button>
            <button type="button" onClick={() => setFilterHighRisk((v) => !v)} className={chipCls(filterHighRisk)}>คะแนนสะสม ≥ 20</button>

            <select value={filterMajor} onChange={(e) => setFilterMajor(e.target.value)} className={filterCls}>
              <option value="">ทุกสาขาวิชา</option>
              {majorOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            <div className="flex items-center gap-2">
              <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className={filterCls} />
              <span className="text-sm text-ink-faint">ถึง</span>
              <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className={filterCls} />
            </div>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-sm font-semibold text-bad-fg hover:underline">
                ล้างตัวกรอง
              </button>
            )}
          </div>
        )}

        {filterHighRisk && !seesAllRecords && (
          <p className="mt-3 text-xs text-warn-fg">
            ⚠ คุณเห็นเฉพาะรายการที่ตัวเองบันทึก ยอดสะสม ≥20 นี้จึงอาจไม่ใช่ยอดรวมจริงของนักเรียน
            ถ้ามีครูคนอื่นเคยตัดคะแนนคนเดียวกันไว้ด้วย — อยากได้ยอดสะสมจริงครบทุกคนที่บันทึก ให้ดูที่หน้า "ประวัตินักเรียน" แทน
          </p>
        )}
      </div>

      {isLoading && !editingRecord ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-9 w-9 text-brand-600 animate-spin mb-4" />
          <p className="text-ink-mute font-medium text-sm">กำลังโหลด / ประมวลผลข้อมูล...</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="bg-white rounded-[20px] border border-line py-12 px-5 flex flex-col items-center gap-3 text-ink-faint">
          <Inbox size={32} strokeWidth={1.5} />
          <span className="text-[15px] font-display text-ink-soft">ไม่พบข้อมูลที่ค้นหา</span>
          <span className="text-[13px] text-ink-faint">ลองแก้คำค้นหรือล้างตัวกรอง</span>
        </div>
      ) : (
        <>
          {/* --- Desktop: table --- */}
          <div className="hidden md:block bg-white rounded-[20px] border border-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[920px]">
                <thead>
                  <tr className="bg-[#FAF6F4] text-ink-mute border-b border-[#F0E7E4]">
                    <th className="p-4 font-bold text-[11px] uppercase tracking-[.04em] whitespace-nowrap">วันที่</th>
                    <th className="p-4 font-bold text-[11px] uppercase tracking-[.04em] whitespace-nowrap">รหัสนักเรียน</th>
                    <th className="p-4 font-bold text-[11px] uppercase tracking-[.04em] whitespace-nowrap">ชื่อ-นามสกุล</th>
                    <th className="p-4 font-bold text-[11px] uppercase tracking-[.04em] whitespace-nowrap">ฐานความผิด</th>
                    <th className="p-4 font-bold text-[11px] uppercase tracking-[.04em] text-center whitespace-nowrap">หัก (คะแนน)</th>
                    <th className="p-4 font-bold text-[11px] uppercase tracking-[.04em] text-center whitespace-nowrap">สถานะ RMS</th>
                    <th className="p-4 font-bold text-[11px] uppercase tracking-[.04em] text-center whitespace-nowrap">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {filteredRecords.map((record, index) => (
                    <tr key={index} className="hover:bg-[#FDF7F6] transition-colors bg-white">
                      <td className="p-4 text-[13.5px] text-ink-mute whitespace-nowrap">{record.displayDate}</td>
                      <td className="p-4 text-[13.5px] font-bold text-brand-600">{record.studentId}</td>
                      <td className="p-4 text-[13.5px]">
                        <p className="font-semibold text-ink">{record.displayFullName}</p>
                        <p className="text-[11.5px] text-ink-faint mt-0.5">{record.displayLevel}</p>
                      </td>
                      <td className="p-4 text-[13.5px] text-ink-soft">{record.offense}</td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center rounded-full bg-bad-bg text-bad-fg px-2.5 py-0.5 text-xs font-bold">
                          {String(record.points).startsWith('-') ? record.points : `-${record.points}`}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        {SYNC_STATUS_MAP[record.rmsSyncStatus] ? (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${SYNC_STATUS_MAP[record.rmsSyncStatus].cls}`}>
                            {SYNC_STATUS_MAP[record.rmsSyncStatus].label}
                          </span>
                        ) : (
                          <span className="text-ink-faint">-</span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {onViewStudent && (
                            <button
                              onClick={() => onViewStudent(record.studentId)}
                              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-brand-700 bg-brand-50 hover:bg-brand-100 transition-colors"
                              title="ดูประวัตินักเรียนคนนี้"
                            >
                              <UserRound size={17} />
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(record)}
                            disabled={!offensesReady}
                            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-gold-700 bg-gold-50 hover:bg-gold-100 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                            title={offensesReady ? "แก้ไขข้อมูล" : "กำลังโหลดรายการฐานความผิด..."}
                          >
                            <Edit size={17} />
                          </button>

                          {record.pdfUrl ? (
                            <a
                              href={record.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-brand-600 bg-brand-50 hover:bg-brand-100 transition-colors"
                              title="เปิดไฟล์ PDF"
                            >
                              <FileText size={17} />
                            </a>
                          ) : (
                            // รายการที่เพิ่งบันทึกใหม่ๆ PDF จะยังไม่เสร็จทันที (สร้างแบบ
                            // เบื้องหลังแยกจากปุ่มบันทึก — ดู DeductionForm.jsx) ปกติจะ
                            // เสร็จภายในไม่กี่วินาที ถ้ายังไม่เห็นให้รีเฟรชหน้านี้อีกครั้ง
                            <span className="text-[11px] text-ink-faint whitespace-nowrap" title="กำลังจัดทำเอกสาร PDF อยู่ กรุณารีเฟรชอีกครู่">กำลังจัดทำ...</span>
                          )}

                          {admin && (
                            <button
                              onClick={() => handleDeleteRecord(record)}
                              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-bad-fg bg-bad-bg hover:brightness-95 transition-all"
                              title="ลบรายการนี้"
                            >
                              <Trash2 size={17} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* --- Mobile: record cards --- */}
          <div className="md:hidden flex flex-col gap-2.5">
            {filteredRecords.map((record, index) => (
              <div key={index} className="bg-white rounded-[18px] border border-line p-3.5 flex flex-col gap-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-ink truncate">{record.displayFullName}</p>
                    <p className="text-xs text-ink-mute mt-0.5">{record.studentId} · {record.displayLevel}</p>
                  </div>
                  <span className="shrink-0 inline-flex items-center rounded-full bg-bad-bg text-bad-fg px-2.5 py-0.5 text-[13.5px] font-bold">
                    {String(record.points).startsWith('-') ? record.points : `-${record.points}`}
                  </span>
                </div>

                <div className="rounded-xl bg-[#FAF6F4] px-3 py-2.5 text-[13px] text-ink-soft">
                  {record.offense}
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-faint">{record.displayDate}</span>
                    {SYNC_STATUS_MAP[record.rmsSyncStatus] && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${SYNC_STATUS_MAP[record.rmsSyncStatus].cls}`}>
                        {SYNC_STATUS_MAP[record.rmsSyncStatus].label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onViewStudent && (
                      <button
                        onClick={() => onViewStudent(record.studentId)}
                        className="min-h-11 px-3 rounded-xl border border-line text-brand-700 bg-brand-50 text-xs font-semibold"
                      >
                        ประวัติ
                      </button>
                    )}
                    <button
                      onClick={() => openEditModal(record)}
                      disabled={!offensesReady}
                      className="min-h-11 px-3 rounded-xl border border-line text-gold-700 bg-gold-50 text-xs font-semibold disabled:opacity-40 disabled:pointer-events-none"
                    >
                      แก้ไข
                    </button>
                    {record.pdfUrl ? (
                      <a
                        href={record.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="min-h-11 px-3 rounded-xl border border-line text-brand-600 bg-brand-50 text-xs font-semibold flex items-center"
                      >
                        PDF
                      </a>
                    ) : (
                      <span className="min-h-11 px-3 rounded-xl border border-line-soft text-ink-faint text-xs flex items-center">กำลังจัดทำ...</span>
                    )}
                    {admin && (
                      <button
                        onClick={() => handleDeleteRecord(record)}
                        className="min-h-11 px-3 rounded-xl border border-line text-bad-fg bg-bad-bg text-xs font-semibold"
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {editingRecord && (
        <EditRecordModal
          record={editingRecord}
          offenses={offenses}
          onChange={handleEditChange}
          onSubmit={handleSaveEdit}
          onClose={() => setEditingRecord(null)}
          isSaving={isLoading}
        />
      )}
    </div>
  );
}
