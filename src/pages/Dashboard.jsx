import React, { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { callAPI } from '../services/api';
import { statusForPoints } from '../data/thresholds';
import { academicYearOf, currentAcademicYear, currentTermLabel } from '../data/academicYear';
import { isAdmin, canViewAllRecords } from '../utils/permissions';
import { parsePoints } from '../utils/points';
import SummaryCard from '../components/ui/SummaryCard';
import AtRiskStudentsCard from '../components/dashboard/AtRiskStudentsCard';
import TopOffensesCard from '../components/dashboard/TopOffensesCard';
import TopStudentsCard from '../components/dashboard/TopStudentsCard';
import RpaBotCard from '../components/dashboard/RpaBotCard';
import ProbationModal from '../components/ProbationModal';

function normalizeOffense(offense = '') {
  return offense.startsWith('อื่นๆ') ? 'อื่นๆ' : offense;
}

export default function Dashboard({ onViewStudent }) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [rpaStats, setRpaStats] = useState(null);
  const [rpaLoading, setRpaLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const admin = isAdmin(currentUser);
  const canManageProbation = canViewAllRecords(currentUser);

  // สถานะทัณฑ์บน + ปุ่มบันทึกด่วนจากการ์ด "นักเรียนที่ถึงเกณฑ์" — ดูเหตุผลเต็มที่
  // AtRiskStudentsCard.jsx (ฟีดแบ็กจากผู้ใช้งานจริง: หน้า "ประวัตินักเรียน" เดิม
  // หาปุ่มบันทึกทัณฑ์บนยาก + ต้องค้นหานักเรียนเองก่อนถึงจะทำได้)
  const [probationByStudent, setProbationByStudent] = useState({});
  const [probationTarget, setProbationTarget] = useState(null); // { studentId, studentName } | null

  // จำนวนนักเรียนที่มีประวัติทัณฑ์บนทั้งหมด (ไม่ผูกกับคะแนนสะสม/ปีการศึกษา) —
  // ใช้กับการ์ดสรุปด้านล่าง โชว์เป็นตัวเลขรวมง่ายๆ กดแล้วพาไปหน้า "ประวัตินักเรียน"
  // แบบไม่เลือกใครไว้ล่วงหน้า (ดู StudentProfile.jsx) ซึ่งจะโชว์รายชื่อทัณฑ์บน
  // ทั้งหมดให้เลือกดูต่อได้ทันที — ไม่ต้องยิง API เพิ่มเพราะ probationByStudent
  // ถูกดึงมาอยู่แล้วสำหรับป้าย/ปุ่มด่วนในการ์ด "นักเรียนที่ถึงเกณฑ์" ด้านล่าง
  const probationCount = Object.keys(probationByStudent).length;

  const fetchProbationStatus = async () => {
    try {
      const result = await callAPI('getProbationStatus', {});
      if (result.status === 'success') setProbationByStudent(result.data || {});
    } catch {
      // เงียบไว้ — ไม่ให้ป้ายทัณฑ์บนที่ดึงไม่สำเร็จไปรบกวนแผงควบคุมหลัก
    }
  };

  // 🔄 รีเฟรชข้อมูลอัตโนมัติเป็นระยะ — เดิมหน้านี้ดึงข้อมูลแค่ตอนเปิดหน้าครั้ง
  // เดียว ถ้าเปิดแผงควบคุมค้างไว้จอมอนิเตอร์ (การใช้งานจริงของแอดมิน — เปิดคอม
  // ไว้ดูภาพรวมทั้งวัน) แล้วมีครูคนอื่นบันทึกรายการใหม่ระหว่างนั้น จะไม่เห็นการ
  // เปลี่ยนแปลงเลยจนกว่าจะรีเฟรชหน้าเว็บเอง — โพลทุก 45 วิ (นานกว่าแคชฝั่งเว็บ 15
  // วิ เพื่อให้ได้ข้อมูลสดจริงทุกรอบ ไม่ใช่แค่แคชเดิม) การโพลรอบถัดๆ ไปไม่โชว์
  // หน้าโหลดเต็มจอ/ไม่เด้ง error popup (showSpinner=false) กันจอกระพริบ/รบกวนแอดมิน
  // ที่กำลังดูอยู่เฉยๆ ถ้าพลาดชั่วคราวรอบเดียวก็แค่ลองใหม่เองอัตโนมัติในรอบถัดไป
  useEffect(() => {
    let cancelled = false;

    const loadRecords = async (showSpinner) => {
      if (showSpinner) setIsLoading(true);
      try {
        const result = await callAPI('getRecords', {});
        if (cancelled) return;
        if (result.status === 'success') {
          setRecords(result.data || []);
        } else if (showSpinner) {
          Swal.fire('ข้อผิดพลาด', result.message || 'ไม่สามารถดึงข้อมูลได้', 'error');
        }
      } catch {
        if (!cancelled && showSpinner) {
          Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
        }
      } finally {
        if (!cancelled && showSpinner) setIsLoading(false);
      }
    };

    loadRecords(true);
    fetchProbationStatus();
    const intervalId = setInterval(() => loadRecords(false), 45000);

    const stored = localStorage.getItem('currentUser');
    if (stored) setCurrentUser(JSON.parse(stored));

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
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
          meta={currentTermLabel()}
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
        <SummaryCard
          variant="plain"
          tone="bad"
          label="อยู่ระหว่างทัณฑ์บน"
          value={probationCount}
          meta={onViewStudent ? 'แตะเพื่อดูรายชื่อ' : undefined}
          onClick={onViewStudent ? () => onViewStudent(null) : undefined}
        />
      </div>

      <AtRiskStudentsCard
        students={stats.atRiskStudents}
        thisAcademicYear={stats.thisAcademicYear}
        onViewStudent={onViewStudent}
        probationByStudent={probationByStudent}
        onAddProbation={canManageProbation ? (studentId, studentName) => setProbationTarget({ studentId, studentName }) : undefined}
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

      {probationTarget && (
        <ProbationModal
          student={probationTarget}
          onClose={() => setProbationTarget(null)}
          onSaved={fetchProbationStatus}
        />
      )}

    </div>
  );
}
