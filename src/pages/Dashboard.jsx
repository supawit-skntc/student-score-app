import React, { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { callAPI } from '../services/api';
import { statusForPoints } from '../data/thresholds';
import { academicYearOf, currentAcademicYear } from '../data/academicYear';
import { isAdmin } from '../utils/permissions';
import SummaryCard from '../components/ui/SummaryCard';
import AtRiskStudentsCard from '../components/dashboard/AtRiskStudentsCard';
import TopOffensesCard from '../components/dashboard/TopOffensesCard';
import TopStudentsCard from '../components/dashboard/TopStudentsCard';
import RpaBotCard from '../components/dashboard/RpaBotCard';

function normalizeOffense(offense = '') {
  return offense.startsWith('อื่นๆ') ? 'อื่นๆ' : offense;
}

function parsePoints(points) {
  const n = parseInt(String(points).replace('-', ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export default function Dashboard({ onViewStudent }) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rpaStats, setRpaStats] = useState(null);
  const [rpaLoading, setRpaLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const admin = isAdmin(currentUser);

  useEffect(() => {
    (async () => {
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
    })();

    const stored = localStorage.getItem('currentUser');
    if (stored) setCurrentUser(JSON.parse(stored));
  }, []);

  // สถิติละเอียดของ RPA Bot (อัตราสำเร็จ, เวลาเฉลี่ย ฯลฯ) เป็นรายละเอียดเชิง
  // ปฏิบัติการที่ครูทั่วไปไม่จำเป็นต้องรู้ — ให้เฉพาะ admin เห็น และไม่ยิง request
  // นี้เลยถ้าไม่ใช่ admin เพื่อไม่เปลืองโควตา GAS โดยไม่จำเป็น
  useEffect(() => {
    if (!admin) {
      setRpaLoading(false);
      return;
    }
    (async () => {
      setRpaLoading(true);
      try {
        const result = await callAPI('getRpaStats', {});
        if (result.status === 'success') setRpaStats(result.data);
      } catch {
        // เงียบไว้ — ไม่ให้สถิติบอทที่ดึงไม่สำเร็จไปรบกวนแผงควบคุมหลัก
      } finally {
        setRpaLoading(false);
      }
    })();
  }, [admin]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = records.filter((r) => {
      const d = new Date(r.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const totalPoints = records.reduce((sum, r) => sum + parsePoints(r.points), 0);
    const avgPoints = records.length ? (totalPoints / records.length).toFixed(1) : '0.0';

    // สรุปสถานะเอกสารทั้งหมด — "บันทึกเข้า RMS แล้ว" นับเฉพาะ synced จริงๆ ส่วน
    // "รอบันทึกเข้า RMS" รวมทุกสถานะที่ยังไม่ synced (pending/needs_review/error/
    // ยังไม่เคยตั้งสถานะ) เพราะทั้งหมดนี้ยังไม่มีอยู่ใน RMS จริงเหมือนกัน
    const syncedCount = records.filter((r) => r.rmsSyncStatus === 'synced').length;
    const notSyncedCount = records.length - syncedCount;

    // top offense categories
    const offenseMap = new Map();
    records.forEach((r) => {
      const key = normalizeOffense(r.offense);
      offenseMap.set(key, (offenseMap.get(key) || 0) + 1);
    });
    const topOffenses = [...offenseMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const maxOffenseCount = topOffenses[0]?.[1] || 1;

    // คะแนนสะสมของนักเรียนแต่ละคน — นับเฉพาะ "ปีการศึกษาปัจจุบัน" เท่านั้น เพราะ
    // ระเบียบข้อ 11 กำหนดให้รีเซ็ตคะแนนความประพฤติเมื่อขึ้นปีการศึกษาใหม่ (ยกเว้น
    // ประวัติทัณฑ์บนที่ยังไม่มีการเก็บแยกในระบบตอนนี้)
    const thisAcademicYear = currentAcademicYear();
    const studentMap = new Map();
    records.forEach((r) => {
      if (academicYearOf(r.date) !== thisAcademicYear) return;
      const key = r.studentId;
      const prev = studentMap.get(key) || { name: r.displayFullName, total: 0, count: 0 };
      prev.total += parsePoints(r.points);
      prev.count += 1;
      studentMap.set(key, prev);
    });
    const topStudents = [...studentMap.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);

    // นักเรียนที่คะแนนสะสมถึงเกณฑ์ต้องดำเนินการตามข้อ 8.3 (ดู src/data/thresholds.js)
    const atRiskStudents = [...studentMap.entries()]
      .map(([studentId, s]) => ({ studentId, ...s, status: statusForPoints(s.total) }))
      .filter((s) => s.status)
      .sort((a, b) => b.total - a.total);

    return {
      total: records.length,
      thisMonth: thisMonth.length,
      avgPoints,
      syncedCount,
      notSyncedCount,
      topOffenses,
      maxOffenseCount,
      topStudents,
      atRiskStudents,
      thisAcademicYear,
    };
  }, [records]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-9 w-9 text-brand-600 animate-spin mb-4" />
        <p className="text-ink-mute font-medium text-sm">กำลังโหลดข้อมูล...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[18px]">

      {/* --- Summary strip --- */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <SummaryCard
          variant="feature"
          tone="brand"
          label="เอกสารทั้งหมด"
          value={stats.total}
          meta={`ปีการศึกษา ${stats.thisAcademicYear}`}
        />
        <SummaryCard variant="plain" tone="ink" label="รายการเดือนนี้" value={stats.thisMonth} />
        <SummaryCard variant="plain" tone="bad" label="คะแนนเฉลี่ยที่ถูกหัก / รายการ" value={stats.avgPoints} meta="คะแนน" />
        <SummaryCard
          variant="plain"
          tone="ok"
          label="บันทึกเข้า RMS แล้ว"
          value={stats.syncedCount}
          progress={stats.total ? (stats.syncedCount / stats.total) * 100 : 0}
        />
        <SummaryCard
          variant="warn"
          tone="warn"
          label="รอบันทึกเข้า RMS"
          value={stats.notSyncedCount}
          meta="รอบอทประมวลผลเข้า RMS"
        />
      </div>

      <AtRiskStudentsCard
        students={stats.atRiskStudents}
        thisAcademicYear={stats.thisAcademicYear}
        onViewStudent={onViewStudent}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        <TopOffensesCard topOffenses={stats.topOffenses} maxOffenseCount={stats.maxOffenseCount} />
        <TopStudentsCard
          topStudents={stats.topStudents}
          thisAcademicYear={stats.thisAcademicYear}
          onViewStudent={onViewStudent}
        />
      </div>

      {admin && <RpaBotCard rpaStats={rpaStats} rpaLoading={rpaLoading} />}

    </div>
  );
}
