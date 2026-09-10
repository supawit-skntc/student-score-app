import React, { useState, useEffect } from 'react';
import { Loader2, Search, Inbox } from 'lucide-react';
import Swal from 'sweetalert2';
import { callAPI } from '../services/api';

const ACTION_LABELS = {
  CREATE_RECORD: 'สร้างรายการตัดคะแนน',
  UPDATE_RECORD: 'แก้ไขรายการตัดคะแนน',
  DELETE_RECORD: 'ลบรายการตัดคะแนน',
  CREATE_USER: 'เพิ่มผู้ใช้งาน',
  UPDATE_USER: 'แก้ไขผู้ใช้งาน',
  DELETE_USER: 'ลบผู้ใช้งาน',
};

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function formatLogTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543} · ${time}`;
}

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const result = await callAPI('getAuditLogs', {});
        if (result.status === 'success') {
          setLogs(result.data || []);
        } else {
          Swal.fire('ข้อผิดพลาด', result.message || 'ไม่สามารถดึงข้อมูลได้', 'error');
        }
      } catch {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filtered = logs.filter((l) =>
    l.user.includes(searchTerm) ||
    l.targetId.includes(searchTerm) ||
    (ACTION_LABELS[l.action] || l.action).includes(searchTerm)
  );

  return (
    <div className="bg-white p-6 rounded-2xl shadow-card border border-slate-100">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div className="relative w-full md:w-80">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-4.5 w-4.5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="ค้นหาผู้ใช้งาน, การกระทำ, เป้าหมาย..."
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl focus:border-brand-500 focus:ring-2 focus:ring-gold-300 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <span className="text-sm text-slate-400 font-medium shrink-0">
          {filtered.length} รายการ {logs.length >= 500 ? '(แสดงล่าสุด 500 รายการ)' : ''}
        </span>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-9 w-9 text-brand-600 animate-spin mb-4" />
          <p className="text-slate-500 font-medium text-sm">กำลังโหลดข้อมูล...</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="p-4 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">เวลา</th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">ผู้ใช้งาน</th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">การกระทำ</th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">เป้าหมาย</th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wide text-center whitespace-nowrap">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map((log, i) => (
                  <tr key={i} className="hover:bg-brand-50/40 transition-colors bg-white">
                    <td className="p-4 text-sm text-slate-500 whitespace-nowrap">{formatLogTime(log.timestamp)}</td>
                    <td className="p-4 text-sm font-semibold text-slate-700">{log.user || '-'}</td>
                    <td className="p-4 text-sm text-slate-600">{ACTION_LABELS[log.action] || log.action}</td>
                    <td className="p-4 text-sm text-slate-500">{log.targetId || '-'}</td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        log.status.startsWith('SUCCESS') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
                      }`}>
                        {log.status.startsWith('SUCCESS') ? 'สำเร็จ' : log.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-400">
                      <Inbox size={32} strokeWidth={1.5} />
                      <span className="text-sm font-medium">ยังไม่มีประวัติการทำงาน</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
