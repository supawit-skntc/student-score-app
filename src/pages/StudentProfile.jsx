import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Search, FileText, UserRound, Inbox, Trash2, ShieldAlert, Plus, ChevronDown, Edit } from 'lucide-react';
import Swal from 'sweetalert2';
import { callAPI } from '../services/api';
import { statusForPoints } from '../data/thresholds';
import { academicYearOf, currentAcademicYear } from '../data/academicYear';
import { isAdmin, canViewAllRecords } from '../utils/permissions';
import { parsePoints } from '../utils/points';
import { escapeHtml } from '../utils/html';
import ProbationModal from '../components/ProbationModal';

// จำกัดจำนวนชิปที่แสดงพร้อมกัน — ถ้าโรงเรียนมีนักเรียนโดนตัดคะแนนหลายร้อยคน
// (ไม่ใช่แค่ไม่กี่คนซ้ำๆ เหมือนข้อมูลตัวอย่างตอนออกแบบ) รายการจะยาวจนรกจอ ต้อง
// ให้ครูพิมพ์ค้นหาให้เจาะจงขึ้นแทน
const MAX_CHIP_RESULTS = 20;

// ไล่สีตามความรุนแรง (จำนวนครั้งที่ทำทัณฑ์บน) แบบเดียวกับ SCORE_BOX_CLS ใน
// AtRiskStudentsCard.jsx — คนละที่กันแต่หลักการเดียวกัน: ทำให้การ์ดนี้ "อ่านได้
// ทันที" โดยไม่ต้องนับตัวเลขทีละคน 1 ครั้งยังถือว่าเบา ให้โทนกลาง ส่วน 3 ครั้งขึ้น
// ไปถือว่าน่าห่วงมากแล้วให้โทนแดงเข้มสุด
const PROBATION_TONE_CLS = {
  notice: 'bg-gold-50 text-gold-700',
  warn: 'bg-warn-bg text-warn-fg',
  critical: 'bg-bad-bg text-bad-fg',
};
function probationTone(count) {
  if (count >= 3) return 'critical';
  if (count === 2) return 'warn';
  return 'notice';
}

// ตัดเลขห้องออกจาก displayLevel ("ปวช. ปี 2/2" -> "ปวช.2") ให้จัดกลุ่มตามชั้นปี
// เฉยๆ แทนห้อง — ฟีดแบ็กจากผู้ใช้งานจริง: แบ่งตามห้องแยกย่อยเกินไป จำนวนหมวดจะ
// เยอะโดยไม่จำเป็นถ้านักเรียนที่ทำทัณฑ์บนกระจายกันหลายห้อง ทั้งที่ปกติดูภาพรวม
// แค่ระดับชั้นปีก็พอแล้ว — ถ้ารูปแบบไม่ตรงตามที่คาด (เช่น "ไม่ระบุระดับชั้น") ใช้
// ค่าเดิมทั้งดุ้นแทนไม่ให้พัง
function probationGroupKey(levelStr) {
  const match = String(levelStr || '').match(/^(.*?)\s*ปี\s*(\d+)\/\d+$/);
  return match ? `${match[1]}${match[2]}` : (levelStr || 'ไม่ระบุระดับชั้น');
}

// รับ initialStudentId เผื่อมาจากปุ่ม "ดูประวัติ" ในหน้า Dashboard/Report — ถ้าไม่มี
// ก็ใช้เป็นหน้าค้นหาอิสระได้ตามปกติ
export default function StudentProfile({ initialStudentId }) {
  const [records, setRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState(initialStudentId || null);
  const [currentUser, setCurrentUser] = useState(null);
  const admin = isAdmin(currentUser);
  // งานปกครอง (แอดมิน + กลุ่มเห็นทุกรายการ) เท่านั้นที่บันทึกทัณฑ์บนใหม่ได้ — ดู
  // requireDisciplineStaff_ ใน Utils.gs ฝั่งเซิร์ฟเวอร์ที่บังคับสิทธิ์นี้จริง ที่นี่
  // แค่ซ่อน/โชว์ปุ่มเป็น UI เท่านั้น
  const canManageProbation = canViewAllRecords(currentUser);

  // สถานะทัณฑ์บน — เก็บแยกจากคะแนนสะสม (ชีต Probation คนละชีตกับ Records) เพราะ
  // ทัณฑ์บนไม่ถูกรีเซ็ตไปกับคะแนนตอนขึ้นปีการศึกษาใหม่ (ต่างจากคะแนนสะสมด้านบน
  // ที่ยังรีเซ็ตทุกปีตามปกติ) — map รหัสนักเรียน -> รายการทัณฑ์บนทั้งหมดของคนนั้น
  // การ "บันทึกใหม่" ใช้ ProbationModal ตัวเดียวกับหน้าแดชบอร์ด (ดูคำอธิบายที่
  // src/components/ProbationModal.jsx) ไม่เขียนฟอร์มแยกซ้ำที่นี่อีก
  const [probationByStudent, setProbationByStudent] = useState({});
  const [addingProbationFor, setAddingProbationFor] = useState(null); // { studentId, studentName } | null
  const [editingProbation, setEditingProbation] = useState(null); // { id, date, note } | null

  // การ์ด "นักเรียนที่มีประวัติทัณฑ์บน" แบ่งเป็นหมวดตามชั้นปี กดที่หัวหมวดเพื่อ
  // กางดูรายชื่อ (ดูเหตุผลเต็มที่ตัวแปร probationGroups ด้านล่าง) — ค่าเริ่มต้น "พับ
  // ทุกหมวด" โชว์แค่ชื่อชั้นปี + จำนวนคน (เช่น ปวช.2 (1 คน)) ไม่โชว์รายชื่อนักเรียนก่อน
  // ที่ผู้ใช้งานจะกดเอง (ฟีดแบ็กจากผู้ใช้งานจริง: รายชื่อโผล่มาเองทั้งที่ยังไม่ได้ค้นหา/
  // กดดู) เก็บเป็น "หมวดที่ถูกกางออก" (ว่าง = พับหมด) ซึ่งทำให้หมวดที่เพิ่งโผล่หลังโหลด
  // ข้อมูลเสร็จพับอยู่ตามค่าเริ่มต้นเองโดยไม่ต้องรู้รายชื่อหมวดล่วงหน้า
  const [expandedProbationGroups, setExpandedProbationGroups] = useState(() => new Set());
  const toggleProbationGroup = (key) => {
    setExpandedProbationGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // id ของรายการ/ทัณฑ์บนที่ลบไปแล้วในหน้านี้ — ใช้กรองผลโพลหรือการดึงข้อมูลที่ตอบกลับ
  // มาช้ากว่าการลบ กันรายการที่ลบไปแล้วเด้งกลับมาโชว์ค้าง (ดู handleDeleteRecord)
  const deletedRecordIdsRef = useRef(new Set());
  const deletedProbationIdsRef = useRef(new Set());
  const withoutDeletedProbation = (map) => {
    if (deletedProbationIdsRef.current.size === 0) return map;
    const next = {};
    Object.keys(map).forEach((sid) => {
      const list = map[sid].filter((x) => !deletedProbationIdsRef.current.has(x.id));
      if (list.length) next[sid] = list;
    });
    return next;
  };

  const fetchRecords = async (showSpinner = true) => {
    if (showSpinner) setIsLoading(true);
    try {
      const result = await callAPI('getRecords', {});
      if (result.status === 'success') {
        setRecords((result.data || []).filter((r) => !deletedRecordIdsRef.current.has(r.id)));
        // 🚀 probationByStudent มากับคำตอบเดียวกันนี้แล้ว (ดู getRecords ใน
        // Service_Records.gs) ไม่ต้องยิง getProbationStatus แยกตอนโหลดหน้าอีก
        // ต่อไป — ลดจาก 2 round-trip เหลือ 1 ทุกครั้งที่เปิด/โพลหน้านี้ (ยังคง
        // เรียก fetchProbationStatus() แยกได้อยู่ ใช้ตอนอยากรีเฟรชป้ายทันทีหลัง
        // เพิ่ม/แก้ไข/ลบทัณฑ์บนโดยไม่ต้องโหลดรายการตัดคะแนนทั้งหมดซ้ำ)
        if (result.probationByStudent) setProbationByStudent(withoutDeletedProbation(result.probationByStudent));
      } else if (showSpinner) {
        Swal.fire('ข้อผิดพลาด', result.message || 'ไม่สามารถดึงข้อมูลได้', 'error');
      }
    } catch {
      if (showSpinner) Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      if (showSpinner) setIsLoading(false);
    }
  };

  const fetchProbationStatus = async () => {
    try {
      const result = await callAPI('getProbationStatus', {});
      if (result.status === 'success') setProbationByStudent(withoutDeletedProbation(result.data || {}));
    } catch {
      // เงียบไว้ — ไม่ให้ป้ายทัณฑ์บนที่ดึงไม่สำเร็จไปรบกวนหน้าประวัติหลัก
    }
  };

  // 🔄 โพลรีเฟรชพื้นหลังทุก 45 วิ (แพตเทิร์นเดียวกับ Dashboard.jsx/Report.jsx) —
  // เดิมหน้านี้ดึงข้อมูลแค่ตอนเปิดหน้าครั้งเดียว ถ้าเปิดค้างไว้ดูประวัตินักเรียน
  // คนหนึ่งระหว่างที่ PDF ของรายการที่เพิ่งบันทึกใหม่กำลังสร้างเสร็จเบื้องหลัง จะ
  // ยังโชว์ "กำลังจัดทำ..." ค้างอยู่แม้ PDF เสร็จแล้วจริงๆ จนกว่าจะรีเฟรชเอง —
  // โพลนี้ไม่โชว์ spinner เต็มจอ/ไม่เด้ง error (showSpinner=false)
  useEffect(() => {
    fetchRecords();
    const stored = localStorage.getItem('currentUser');
    if (stored) setCurrentUser(JSON.parse(stored));

    // ข้ามรอบโพลตอนแท็บ/หน้าจออยู่เบื้องหลัง (ดูเหตุผลเต็มที่ Dashboard.jsx)
    const intervalId = setInterval(() => {
      if (!document.hidden) fetchRecords(false);
    }, 45000);
    return () => clearInterval(intervalId);
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
      // 🔒 escapeHtml ก่อนเสมอ — offense มาจากช่องกรอกอิสระของผู้ใช้ ("อื่นๆ: ...")
      // ถ้าไม่ escape ก่อนแทรกลง html: ตรงๆ จะเปิดช่อง stored XSS ให้รันโค้ดใน
      // เบราว์เซอร์ของแอดมินที่มาเปิด popup นี้ได้
      html: `${escapeHtml(record.offense)}<br/>${escapeHtml(record.displayDate)}` +
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

      // ⚡ เอารายการออกจากจอทันทีที่กดยืนยัน ไม่รอเซิร์ฟเวอร์ (เดิมรอ ~2 วิ แล้ว
      // fetchRecords() ซ้ำอีกรอบพร้อมหน้าจอหมุนเต็มทับทั้งหน้าประวัตินักเรียน =
      // อีก ~2 วิ ทั้งที่หายไปแค่ 1 รายการ) — ถ้าเซิร์ฟเวอร์ปฏิเสธ/ต่อไม่ได้ จะใส่
      // กลับที่ตำแหน่งเดิมพร้อมแจ้งข้อผิดพลาด
      const originalIndex = records.findIndex((r) => r.id === record.id);
      deletedRecordIdsRef.current.add(record.id);
      setRecords((prev) => prev.filter((r) => r.id !== record.id));

      const restore = (message) => {
        deletedRecordIdsRef.current.delete(record.id);
        setRecords((prev) => {
          if (prev.some((r) => r.id === record.id)) return prev;
          const next = [...prev];
          next.splice(Math.min(Math.max(originalIndex, 0), next.length), 0, record);
          return next;
        });
        Swal.fire('ข้อผิดพลาด', message, 'error');
      };

      try {
        const res = await callAPI('deleteRecord', { id: record.id });
        if (res.status === 'success') {
          Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1200, showConfirmButton: false });
        } else {
          restore(res.message);
        }
      } catch {
        restore('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
      }
    });
  };

  // ลบรายการทัณฑ์บน — คนละ action กับ handleDeleteRecord ด้านบน (ลบแถวจริงในชีต
  // Probation ไม่ใช่ soft delete แบบ Records ดูเหตุผลเต็มที่ deleteProbationRecord
  // ใน Service_Probation.gs)
  const handleDeleteProbation = (p) => {
    Swal.fire({
      title: 'ลบรายการทัณฑ์บนนี้?',
      html: `${escapeHtml(p.displayDate || '')}` + (p.note ? `<br/>${escapeHtml(p.note)}` : ''),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#E11D48',
      cancelButtonColor: '#94A3B8',
      confirmButtonText: 'ลบรายการ',
      cancelButtonText: 'ยกเลิก',
    }).then(async (result) => {
      if (!result.isConfirmed) return;

      // ⚡ เอาออกจากจอทันที แล้วค่อยยืนยันกับเซิร์ฟเวอร์ (เดิมรอลบเสร็จแล้วยิง
      // getProbationStatus ซ้ำอีก 1 รอบ = 2 รอบต่อเนื่อง) — ล้มเหลวจะใส่กลับที่เดิม
      const sid = selected.studentId;
      const originalIndex = (probationByStudent[sid] || []).findIndex((x) => x.id === p.id);
      deletedProbationIdsRef.current.add(p.id);
      setProbationByStudent((prev) => withoutDeletedProbation(prev));

      const restore = (message) => {
        deletedProbationIdsRef.current.delete(p.id);
        setProbationByStudent((prev) => {
          const list = [...(prev[sid] || [])];
          if (list.some((x) => x.id === p.id)) return prev;
          list.splice(Math.min(Math.max(originalIndex, 0), list.length), 0, p);
          return { ...prev, [sid]: list };
        });
        Swal.fire('ข้อผิดพลาด', message, 'error');
      };

      try {
        const res = await callAPI('deleteProbationRecord', { id: p.id });
        if (res.status === 'success') {
          Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1200, showConfirmButton: false });
        } else {
          restore(res.message);
        }
      } catch {
        restore('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
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
  // 🐛 เดิม fallback เป็น filtered[0] เฉยๆ โดยไม่เช็กว่ามีคำค้นหาจริงไหม — ช่อง
  // ว่างเปล่า "".includes(x) เป็น true เสมอ ทำให้ filtered = นักเรียนทุกคนตั้งแต่
  // ยังไม่พิมพ์อะไรเลย แล้ว filtered[0] (คนคะแนนสะสมสูงสุด) ถูกเลือกโชว์รายละเอียด
  // ให้อัตโนมัติตั้งแต่เพิ่งเปิดหน้ามา ทั้งที่ผู้ใช้งานยังไม่ได้ค้นหา/เลือกอะไรเลย
  // — ต้องมีคำค้นหาจริงๆ (searchTerm ไม่ว่าง) ก่อน ถึงจะ fallback ไปคนแรกในผลลัพธ์ได้
  const selected = students.find((s) => s.studentId === selectedId) || (searchTerm.trim() !== '' ? filtered[0] : null) || null;

  // 🔎 นักเรียนที่มีประวัติทัณฑ์บน (คนละเรื่องกับคะแนนสะสม ไม่รีเซ็ตทุกปี) — เดิม
  // ช่องค้นหาว่างๆ จะโชว์แค่ข้อความ "พิมพ์เพื่อค้นหา" เฉยๆ ทำให้คนที่ทำทัณฑ์บนไป
  // แล้วแต่คะแนนสะสมปีนี้ยังไม่ถึงเกณฑ์ (เลยไม่โผล่ในการ์ด "นักเรียนที่ถึงเกณฑ์"
  // ของแดชบอร์ด) ไม่มีทางเจอได้เลยนอกจากพิมพ์ชื่อเดาตรงๆ — ใช้ students (เรียง
  // ตามคะแนนสะสมมากไปน้อยอยู่แล้ว) กรองเอาเฉพาะคนที่มีอยู่ใน probationByStudent
  const probationStudents = students.filter((s) => (probationByStudent[s.studentId]?.length || 0) > 0);

  // จัดกลุ่มตามห้อง/ระดับชั้น (s.level เช่น "ปวช. ปี 2/2") แทนลิสต์แบนยาวๆ — ครู
  // งานปกครองคิดเป็นห้องอยู่แล้วเวลาต้องติดตาม ถ้ามีนักเรียนทำทัณฑ์บนเยอะขึ้นในอนาคต
  // (สมมติเกิน 20 คนทั้งโรงเรียน) แต่ละห้องก็ยังสั้นเองตามธรรมชาติ ไม่ต้องมีเพดาน/
  // แบ่งหน้าแยกอีกชั้น — เรียงชื่อห้องตามตัวอักษรไทยให้อ่านง่าย (ปวช. ปี 1 ขึ้นก่อน)
  const probationGroups = [];
  {
    const byLevel = new Map();
    probationStudents.forEach((s) => {
      const key = probationGroupKey(s.level);
      if (!byLevel.has(key)) byLevel.set(key, []);
      byLevel.get(key).push(s);
    });
    [...byLevel.keys()].sort((a, b) => a.localeCompare(b, 'th')).forEach((level) => {
      probationGroups.push({ level, list: byLevel.get(level) });
    });
  }

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

  // ประวัติทัณฑ์บนของนักเรียนที่กำลังเลือกอยู่ — คนละชุดกับ historyGroups ด้านบน
  // (ซึ่งเป็นประวัติตัดคะแนนที่รีเซ็ตทุกปี) ทัณฑ์บนนี้อยู่ถาวรไม่รีเซ็ต
  const selectedProbation = selected ? (probationByStudent[selected.studentId] || []) : [];

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

      {/* --- นักเรียนที่มีประวัติทัณฑ์บน: การ์ดแยกต่างหาก ไม่ใช่ชิปแทรกอยู่ในการ์ด
          ค้นหาเหมือนเดิม (ทำให้ดูรกและไม่เป็นสัดส่วน) — โชว์เฉพาะตอนยังไม่ได้พิมพ์
          ค้นหา ให้เป็นทางลัดสำหรับดูคนที่มีประวัติทัณฑ์บนอยู่แล้วโดยไม่ต้องพิมพ์ชื่อ
          เดา (ดูเหตุผลเต็มที่ตัวแปร probationStudents ด้านบน) --- */}
      {searchTerm.trim() === '' && probationStudents.length > 0 && (
        <div className="bg-white rounded-[20px] border border-line p-4">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bad-bg text-bad-fg">
              <ShieldAlert size={16} strokeWidth={2.25} />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-[15px] font-medium text-ink">นักเรียนที่มีประวัติทัณฑ์บน</h2>
              <p className="text-xs text-ink-mute mt-0.5">แตะรายชื่อเพื่อดูรายละเอียด</p>
            </div>
            <span className="ml-auto shrink-0 inline-flex items-center rounded-full bg-bad-bg text-bad-fg px-3 py-1 text-[12.5px] font-bold">
              {probationStudents.length} คน
            </span>
          </div>
          <div className="mt-1 flex flex-col">
            {probationGroups.map(({ level, list }) => {
              const collapsed = !expandedProbationGroups.has(level);
              return (
                <div key={level} className="border-t border-line-soft first:border-t-0">
                  <button
                    type="button"
                    onClick={() => toggleProbationGroup(level)}
                    className="w-full flex items-center gap-2 py-2.5 text-left"
                  >
                    <ChevronDown size={14} className={`shrink-0 text-ink-faint transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                    <span className="text-[12.5px] font-bold text-ink-soft">{level}</span>
                    <span className="text-[11.5px] text-ink-faint">({list.length} คน)</span>
                  </button>
                  {!collapsed && (
                    <div className="pl-[22px] pb-1 divide-y divide-line-soft">
                      {list.map((s) => {
                        const count = probationByStudent[s.studentId].length;
                        const tone = probationTone(count);
                        return (
                          <button
                            key={s.studentId}
                            type="button"
                            onClick={() => setSelectedId(s.studentId)}
                            className="w-full flex items-center gap-3 py-2.5 text-left rounded-[12px] px-2 -mx-2 hover:bg-line-soft/70 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-[13.5px] font-semibold text-ink truncate">{s.name}</p>
                              <p className="mt-0.5 text-[11.5px] text-ink-mute">{s.studentId}</p>
                            </div>
                            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${PROBATION_TONE_CLS[tone]}`}>
                              <ShieldAlert size={11} /> {count} ครั้ง
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-white/[0.14] px-3 py-1 text-[12.5px] font-semibold text-gold-50">
                      {selected.status ? `${selected.status.action} (${selected.status.ref})` : 'ปกติ — ยังไม่ถึงเกณฑ์'}
                    </span>
                    {/* 🏷️ ป้ายนี้อยู่ถาวรไม่ว่าจะขึ้นปีการศึกษาไปกี่รอบแล้วก็ตาม —
                        ต่างจากป้ายคะแนนสะสมด้านซ้ายที่รีเซ็ตทุกปี (ดูเหตุผลเต็มที่
                        Service_Probation.gs) */}
                    {selectedProbation.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-bad-fg/90 px-3 py-1 text-[12.5px] font-semibold text-white">
                        <ShieldAlert size={12} /> เคยทำทัณฑ์บน ({selectedProbation.length})
                      </span>
                    )}
                  </div>
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

          {/* --- ทัณฑ์บน: คนละเรื่องกับคะแนนสะสม ไม่รีเซ็ตทุกปีการศึกษา --- */}
          <div className="rounded-[20px] border border-line bg-white p-[18px]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-[15px] font-medium text-ink">
                ประวัติทัณฑ์บน ({selectedProbation.length} ครั้ง)
              </h3>
              {canManageProbation && (
                <button
                  type="button"
                  onClick={() => setAddingProbationFor({ studentId: selected.studentId, studentName: selected.name })}
                  className="inline-flex items-center gap-1.5 min-h-9 px-3.5 rounded-[11px] border-[1.5px] border-bad-fg/40 bg-bad-bg text-[12.5px] font-semibold text-bad-fg hover:brightness-95 transition"
                >
                  <Plus size={14} /> บันทึกทัณฑ์บน
                </button>
              )}
            </div>

            {selectedProbation.length === 0 ? (
              <p className="py-2 text-sm text-ink-faint">ยังไม่เคยทำทัณฑ์บน</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {selectedProbation.map((p, i) => (
                  // key: p.id เมื่อมี (รายการใหม่ทุกรายการมี) — fallback ไปที่ index
                  // เฉพาะรายการเก่าก่อนมีคอลัมน์ id (ดู findProbationRowById_
                  // ใน Service_Probation.gs) กันแก้ไข/ลบแล้ว React จับคู่แถวผิดตัว
                  <div key={p.id || i} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[13px] bg-bad-bg/50 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1 basis-[140px]">
                      <p className="text-[13.5px] font-semibold text-ink">{p.displayDate || 'ไม่ระบุวันที่'}</p>
                      {p.note && <p className="mt-0.5 text-xs text-ink-mute truncate">{p.note}</p>}
                    </div>
                    <div className="flex max-w-full items-center gap-2">
                      <span className="min-w-0 truncate text-[11px] text-ink-faint">บันทึกโดย {p.recordedBy}</span>
                      {/* ปุ่มแก้ไข/ลบ — ต้องมีทั้งสิทธิ์ (canManageProbation) และมี id
                          (รายการเก่าก่อนมีฟีเจอร์นี้ไม่มี id เลยแก้ไข/ลบผ่านหน้าเว็บ
                          ไม่ได้ ดู findProbationRowById_ ใน Service_Probation.gs) */}
                      {canManageProbation && p.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingProbation(p)}
                            className="inline-flex h-10 w-10 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-[10px] sm:rounded-[8px] text-gold-700 bg-gold-50 hover:bg-gold-100 transition-colors"
                            title="แก้ไขรายการนี้"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProbation(p)}
                            className="inline-flex h-10 w-10 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-[10px] sm:rounded-[8px] text-bad-fg bg-bad-bg hover:brightness-95 transition-all"
                            title="ลบรายการนี้"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                              className="inline-flex items-center justify-center rounded-full bg-brand-50 p-2.5 sm:p-1.5 text-brand-600 transition-colors hover:bg-brand-100 hover:text-brand-700"
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
                              className="inline-flex items-center justify-center rounded-full bg-bad-bg p-2.5 sm:p-1.5 text-bad-fg transition-colors hover:brightness-95"
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

      {addingProbationFor && (
        <ProbationModal
          student={addingProbationFor}
          onClose={() => setAddingProbationFor(null)}
          onSaved={fetchProbationStatus}
        />
      )}

      {editingProbation && selected && (
        <ProbationModal
          student={{ studentId: selected.studentId, studentName: selected.name }}
          editing={editingProbation}
          onClose={() => setEditingProbation(null)}
          onSaved={fetchProbationStatus}
        />
      )}
    </div>
  );
}
