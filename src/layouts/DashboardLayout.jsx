import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileEdit, FileText, LogOut, Users, Plus, UserRound, History } from 'lucide-react';
import Swal from 'sweetalert2';
import { isAdmin } from '../utils/permissions';
import { callAPI } from '../services/api';
import { currentAcademicYear } from '../data/academicYear';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'แผงควบคุม', icon: LayoutDashboard },
  { key: 'form', label: 'บันทึกตัดคะแนน', icon: FileEdit },
  { key: 'report', label: 'รายงาน', icon: FileText },
  { key: 'profile', label: 'ประวัตินักเรียน', icon: UserRound },
  { key: 'users', label: 'จัดการผู้ใช้งาน', icon: Users, adminOnly: true },
  { key: 'auditlog', label: 'ประวัติการทำงานระบบ', icon: History, adminOnly: true },
];

// แถบเมนูล่างบนมือถือแยกชุดจาก NAV_ITEMS เพราะลำดับ/การจัดวางต่างกัน (ปุ่ม FAB
// อยู่ตรงกลาง และ "ประวัติการทำงานระบบ" เข้าถึงได้จากคอมพิวเตอร์เท่านั้น — พื้นที่
// แถบล่างมือถือจำกัด ใส่ครบทุกเมนูจะแน่นเกินไป)
const MOBILE_TABS_LEFT = [
  { key: 'dashboard', label: 'แผงควบคุม', icon: LayoutDashboard },
  { key: 'report', label: 'รายงาน', icon: FileText },
];
const MOBILE_TABS_RIGHT = [
  { key: 'profile', label: 'ประวัติ', icon: UserRound },
  { key: 'users', label: 'ผู้ใช้งาน', icon: Users, adminOnly: true },
];

const PAGE_META = {
  dashboard: { title: 'แผงควบคุม', subtitle: 'ภาพรวมข้อมูลการตัดคะแนนความประพฤติ' },
  form: { title: 'บันทึกตัดคะแนน', subtitle: 'สร้างรายการตัดคะแนนความประพฤติใหม่' },
  report: { title: 'รายงาน', subtitle: 'ประวัติการทำผิดระเบียบของนักเรียน นักศึกษา' },
  profile: { title: 'ประวัตินักเรียน', subtitle: 'ค้นหาคะแนนสะสมและประวัติของนักเรียนแต่ละคนในที่เดียว' },
  users: { title: 'จัดการผู้ใช้งาน', subtitle: 'เพิ่ม แก้ไข และกำหนดสิทธิ์ผู้ใช้งานระบบ' },
  auditlog: { title: 'ประวัติการทำงานระบบ', subtitle: 'ใครทำอะไร เมื่อไหร่ กับข้อมูลใดในระบบบ้าง' },
};

export default function DashboardLayout({ children, setView, view = 'dashboard' }) {
  const [currentUser, setCurrentUser] = useState({ name: 'กำลังโหลด...', role: '' });

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  const handleLogout = () => {
    Swal.fire({
      title: 'ต้องการออกจากระบบ?',
      text: 'คุณกำลังจะออกจากระบบตัดคะแนนความประพฤติ',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#8A2E42',
      cancelButtonColor: '#94A3B8',
      confirmButtonText: 'ออกจากระบบ',
      cancelButtonText: 'ยกเลิก',
    }).then(async (result) => {
      if (result.isConfirmed) {
        // แจ้งเซิร์ฟเวอร์ให้ยกเลิก session token ทันที ไม่ใช่แค่ลบฝั่ง browser
        // เท่านั้น (เดิม token จะยังใช้ได้ต่ออีกจนครบอายุ แม้จะกด logout ไปแล้ว)
        try { await callAPI('logout', {}); } catch { /* ออกจากระบบฝั่ง client ต่อได้แม้เรียกไม่สำเร็จ */ }
        localStorage.removeItem('currentUser');
        Swal.fire({
          icon: 'success',
          title: 'ออกจากระบบสำเร็จ',
          showConfirmButton: false,
          timer: 1500,
        }).then(() => {
          setView('login');
        });
      }
    });
  };

  const initials = (currentUser.name || '').replace(/^(นาย|นาง|นางสาว)/, '').trim().slice(0, 1) || 'ผ';
  const meta = PAGE_META[view] || PAGE_META.dashboard;
  const admin = isAdmin(currentUser);
  const dailyNav = NAV_ITEMS.filter((item) => !item.adminOnly);
  const adminNav = NAV_ITEMS.filter((item) => item.adminOnly && admin);
  const mobileTabs = [
    ...MOBILE_TABS_LEFT,
    ...MOBILE_TABS_RIGHT.filter((item) => !item.adminOnly || admin),
  ];
  const mobileTabsRight = mobileTabs.slice(MOBILE_TABS_LEFT.length);

  const goTo = (key) => setView(key);

  const navButtonClass = (active) =>
    `w-full flex items-center gap-3 min-h-[46px] px-3.5 rounded-[13px] font-display text-[14.5px] font-medium transition-colors
      ${active
        ? 'bg-gold-500 text-brand-900 shadow-[0_6px_14px_-8px_rgba(184,134,15,.9)]'
        : 'text-brand-50/85 hover:bg-white/10 hover:text-white'}`;

  return (
    <div className="h-screen bg-canvas flex font-sans">

      {/* --- Sidebar: desktop only (md+); mobile uses the bottom tab bar instead --- */}
      <aside className="hidden md:flex md:flex-col w-[262px] shrink-0 bg-gradient-to-b from-brand-800 to-brand-900 text-white">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.09] shrink-0">
          <img src="/logo-skntc.png" alt="ตราวิทยาลัยเทคนิคสมุทรสาคร" className="h-[38px] w-[38px] shrink-0 object-contain" />
          <div className="leading-tight min-w-0">
            <div className="font-display font-medium text-[15px]">วท.สมุทรสาคร</div>
            <div className="text-[11px] text-brand-100/65">ตัดคะแนนความประพฤติ</div>
          </div>
        </div>

        <nav className="flex-1 px-3.5 py-4 space-y-1.5 overflow-y-auto">
          <div className="px-2 pb-2 text-[10.5px] font-bold tracking-[.1em] text-brand-100/45">การทำงานประจำวัน</div>
          {dailyNav.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => goTo(key)} className={navButtonClass(view === key)}>
              <Icon size={19} strokeWidth={view === key ? 2.4 : 2} />
              {label}
            </button>
          ))}

          {adminNav.length > 0 && (
            <>
              <div className="px-2 pt-4 pb-2 text-[10.5px] font-bold tracking-[.1em] text-brand-100/45">ผู้ดูแลระบบ</div>
              {adminNav.map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => goTo(key)} className={navButtonClass(view === key)}>
                  <Icon size={19} strokeWidth={view === key ? 2.4 : 2} />
                  {label}
                </button>
              ))}
            </>
          )}
        </nav>

        <div className="m-3.5 p-3.5 rounded-2xl bg-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-gold-500 text-brand-900 flex items-center justify-center font-display font-semibold text-[15px] shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold truncate">{currentUser.name}</div>
              <div className="text-[11px] text-brand-100/60 truncate">{currentUser.role}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full min-h-10 rounded-[11px] border border-white/[0.16] text-brand-100 text-[13px] font-semibold hover:bg-white/10 transition-colors"
          >
            ออกจากระบบ
          </button>
        </div>
      </aside>

      {/* --- Main column --- */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">

        <header className="bg-white flex items-center justify-between gap-4 px-3.5 md:px-6 py-3 md:py-4 border-b border-line shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo-skntc.png" alt="ตราวิทยาลัยเทคนิคสมุทรสาคร" className="md:hidden h-[34px] w-[34px] shrink-0 object-contain" />
            <div className="min-w-0">
              <h1 className="font-display font-medium text-[17px] text-ink leading-tight truncate">{meta.title}</h1>
              <p className="hidden md:block mt-0.5 text-[12.5px] text-ink-mute truncate">{meta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden md:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-line-soft">
              <span className="h-[26px] w-[26px] rounded-full bg-brand-500 text-white flex items-center justify-center text-[12.5px] font-bold">
                {initials}
              </span>
              <span className="text-[12.5px] font-semibold text-ink-soft">ปีการศึกษา {currentAcademicYear()}</span>
            </div>
            <span className="md:hidden h-[34px] w-[34px] rounded-full bg-brand-500 text-white flex items-center justify-center text-[13px] font-bold shrink-0">
              {initials}
            </span>
            <button
              onClick={handleLogout}
              className="md:hidden h-10 w-10 flex items-center justify-center border border-line rounded-xl bg-white text-bad-fg"
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>

        <main className="p-4 md:p-8 overflow-auto flex-1">
          {children}
        </main>

        {/* --- Bottom tab bar: mobile only (below md); replaces the sidebar --- */}
        <nav className="md:hidden shrink-0 flex items-end justify-around gap-0.5 px-1.5 pt-2 pb-2.5 bg-white/[0.97] backdrop-blur-sm border-t border-line shadow-[0_-8px_24px_-16px_rgba(56,16,26,.4)]">
          {MOBILE_TABS_LEFT.map(({ key, label, icon: Icon }) => {
            const active = view === key;
            return (
              <button
                key={key}
                onClick={() => goTo(key)}
                className={`flex flex-col items-center gap-1 min-w-[60px] min-h-[52px] px-1 rounded-xl
                  ${active ? 'bg-brand-50 text-brand-500' : 'text-ink-faint'}`}
              >
                <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                <span className="text-[11px] font-semibold">{label}</span>
              </button>
            );
          })}

          <button
            onClick={() => goTo('form')}
            className="-mt-[22px] h-[52px] w-[52px] rounded-[18px] bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shadow-[0_10px_20px_-8px_rgba(92,29,44,.85)] shrink-0"
          >
            <Plus size={26} />
          </button>

          {mobileTabsRight.map(({ key, label, icon: Icon }) => {
            const active = view === key;
            return (
              <button
                key={key}
                onClick={() => goTo(key)}
                className={`flex flex-col items-center gap-1 min-w-[60px] min-h-[52px] px-1 rounded-xl
                  ${active ? 'bg-brand-50 text-brand-500' : 'text-ink-faint'}`}
              >
                <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                <span className="text-[11px] font-semibold">{label}</span>
              </button>
            );
          })}
        </nav>

      </div>
    </div>
  );
}
