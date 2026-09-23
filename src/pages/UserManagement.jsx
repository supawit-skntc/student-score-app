import React, { useState, useEffect } from 'react';
import { Loader2, UserPlus, Pencil, Trash2, X, Save, KeyRound, ShieldCheck, Eye } from 'lucide-react';
import Swal from 'sweetalert2';
import { callAPI } from '../services/api';
import { ALL_ROLES } from '../utils/permissions';
import Pagination from '../components/ui/Pagination';

const PAGE_SIZE = 20;

const emptyForm = { username: '', fullName: '', role: 'ครูผู้สอน', password: '', email: '' };

const inputCls = "w-full rounded-xl border border-slate-300 p-2.75 outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-gold-300";
const labelCls = "mb-1.5 block text-sm font-semibold text-slate-700";

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // role -> 'admin' | 'full' จากเซิร์ฟเวอร์ (ดู getRoleTiers ใน Service_Users.gs)
  // — หน้านี้เป็นที่เดียวที่ต้องจัดหมวด role ของ "คนอื่น"/role ที่ยังไม่ถูกเลือก
  // จริง (badge ในตาราง + คำอธิบายตอนเลือก role ในฟอร์ม) เลยต้องขอ map เต็มมา
  // แทนที่จะเช็กแค่ roleTier ของตัวเองแบบหน้าอื่น (ดู src/utils/permissions.js)
  const [roleTiers, setRoleTiers] = useState({});

  const [modalMode, setModalMode] = useState(null); // null | 'create' | 'edit'
  const [form, setForm] = useState(emptyForm);
  const [changePassword, setChangePassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [page, setPage] = useState(1);

  // ลบผู้ใช้จนหน้าปัจจุบันเกินหน้าสุดท้ายที่มีจริง (เช่น อยู่หน้า 3 แล้วลบจนเหลือ 2 หน้า)
  // ให้ดึงกลับมาหน้าสุดท้าย ไม่งั้นค้างหน้าว่างและไม่มีปุ่มแบ่งหน้าให้กลับ (แบบเดียวกับ
  // หน้ารายงาน — ดู Report.jsx)
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [users.length, page]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      // NEW backend action — ยังไม่มีใน GAS ปัจจุบัน ต้องเพิ่ม action 'getUsers'
      // ที่ตอบกลับ { status:'success', data:[{username, fullName, role}] }
      // ห้ามส่ง Password_Hash กลับมาฝั่ง client เด็ดขาด
      const result = await callAPI('getUsers', {});
      if (result.status === 'success') {
        setUsers(result.data || []);
        // 🚀 roleTiers มากับคำตอบ getUsers เดียวกันเลย (เดิมยิง getRoleTiers แยกอีก 1
        // รอบทุกครั้งที่เปิดหน้า = อีก ~2 วินาที) — fallback ไปเรียก getRoleTiers เดิม
        // ถ้าคำตอบไม่มี roleTiers (เว็บ deploy ใหม่แล้วแต่ Apps Script ยังเป็นเวอร์ชันเก่า)
        if (result.roleTiers) {
          setRoleTiers(result.roleTiers);
        } else {
          callAPI('getRoleTiers', {}).then((r) => {
            if (r.status === 'success') setRoleTiers(r.data || {});
          });
        }
      } else {
        Swal.fire('ข้อผิดพลาด', result.message || 'ไม่สามารถดึงข้อมูลผู้ใช้งานได้', 'error');
      }
    } catch {
      Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const openCreate = () => {
    setForm(emptyForm);
    setChangePassword(true);
    setModalMode('create');
  };

  const openEdit = (u) => {
    // หมายเหตุ: getUsers ไม่ส่งอีเมลกลับมา (ไม่โชว์ใน UI ตามที่ตั้งใจ) ช่องนี้จึง
    // เริ่มว่างเสมอตอนแก้ไข — เว้นว่างไว้แปลว่า "ไม่แก้อีเมลเดิม" ไม่ใช่ "ลบทิ้ง"
    // (ฝั่งเซิร์ฟเวอร์จะไม่เขียนทับถ้าส่งค่าว่างมา ดู updateUser ใน Service_Users.gs)
    setForm({ username: u.username, fullName: u.fullName, role: u.role, password: '', email: '' });
    setChangePassword(false);
    setModalMode('edit');
  };

  const closeModal = () => setModalMode(null);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (modalMode === 'create') {
        // NEW backend action 'createUser' — GAS ควรเป็นฝ่าย hash รหัสผ่านก่อนเขียนลงชีต
        // (ส่ง password เป็น plain text ผ่าน HTTPS แล้วให้ GAS จัดการ hash ฝั่งเซิร์ฟเวอร์)
        const result = await callAPI('createUser', { data: form });
        if (result.status !== 'success') throw new Error(result.message);
      } else {
        const payload = { username: form.username, fullName: form.fullName, role: form.role, email: form.email };
        if (changePassword) payload.password = form.password;
        // NEW backend action 'updateUser'
        const result = await callAPI('updateUser', { data: payload });
        if (result.status !== 'success') throw new Error(result.message);
      }
      Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
      closeModal();
      // อัปเดตรายการในหน้าจอเองเลย ไม่โหลดรายชื่อทั้งหมดซ้ำพร้อมหน้าจอหมุนเต็ม (เดิม
      // ทำ fetchUsers() อีกรอบ = อีก ~2 วินาที) — getUsers คืนแค่ 3 ฟิลด์นี้ (ชื่อผู้ใช้/
      // ชื่อ-นามสกุล/บทบาท) ซึ่งฟอร์มมีครบทุกตัวอยู่แล้ว จึงได้ผลเหมือนโหลดใหม่ทุกประการ
      const savedUser = { username: form.username.trim(), fullName: form.fullName, role: form.role };
      setUsers((prev) => (modalMode === 'create'
        ? [...prev, savedUser]
        : prev.map((x) => (x.username === savedUser.username ? { ...x, ...savedUser } : x))));
    } catch (err) {
      Swal.fire('ข้อผิดพลาด', err.message || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (u) => {
    Swal.fire({
      title: `ลบผู้ใช้งาน "${u.fullName}"?`,
      text: 'บัญชีนี้จะไม่สามารถเข้าสู่ระบบได้อีก — ประวัติรายการที่เคยบันทึกไว้จะยังคงอยู่',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#E11D48',
      cancelButtonColor: '#94A3B8',
      confirmButtonText: 'ลบผู้ใช้งาน',
      cancelButtonText: 'ยกเลิก',
    }).then(async (result) => {
      if (!result.isConfirmed) return;

      // ⚡ เอาแถวออกจากจอทันที ไม่รอเซิร์ฟเวอร์ แล้วไม่ต้อง fetchUsers() ซ้ำอีกรอบ
      // (เดิมรอลบเสร็จ + โหลดรายชื่อทั้งหมดใหม่พร้อมหน้าจอหมุนเต็ม = 2 รอบต่อเนื่อง
      // ทั้งที่หายไปแค่ 1 แถว) — ล้มเหลวจะใส่กลับที่ตำแหน่งเดิมพร้อมแจ้งข้อผิดพลาด
      const originalIndex = users.findIndex((x) => x.username === u.username);
      setUsers((prev) => prev.filter((x) => x.username !== u.username));

      const restore = (message) => {
        setUsers((prev) => {
          if (prev.some((x) => x.username === u.username)) return prev;
          const next = [...prev];
          next.splice(Math.min(Math.max(originalIndex, 0), next.length), 0, u);
          return next;
        });
        Swal.fire('ข้อผิดพลาด', message, 'error');
      };

      try {
        const res = await callAPI('deleteUser', { username: u.username });
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

  return (
    <div className="bg-white p-6 rounded-2xl shadow-card border border-slate-100">
      <div className="flex justify-between items-center mb-6 gap-4">
        <span className="text-sm text-slate-400 font-medium">{users.length} บัญชี</span>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-brand-700 hover:bg-brand-800 text-white px-4 py-2.5 font-display font-semibold text-sm transition-colors"
        >
          <UserPlus size={17} /> เพิ่มผู้ใช้งาน
        </button>
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
                <th className="p-4 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">ชื่อ-นามสกุล</th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">ชื่อผู้ใช้งาน</th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wide whitespace-nowrap">บทบาท</th>
                <th className="p-4 font-semibold text-xs uppercase tracking-wide text-center whitespace-nowrap">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length > 0 ? users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((u) => {
                const admin = roleTiers[u.role] === 'admin';
                const seesAll = roleTiers[u.role] === 'full';
                return (
                  <tr key={u.username} className="hover:bg-brand-50/40 transition-colors bg-white">
                    <td className="p-4 text-sm text-slate-800 font-medium">{u.fullName}</td>
                    <td className="p-4 text-sm text-slate-500">{u.username}</td>
                    <td className="p-4 text-sm">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold
                        ${admin ? 'bg-gold-50 text-gold-700' : seesAll ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                        {admin && <ShieldCheck size={12} />}
                        {seesAll && <Eye size={12} />}
                        {u.role}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          className="inline-flex items-center justify-center text-gold-700 hover:text-gold-800 bg-gold-50 hover:bg-gold-100 p-2 rounded-full transition-colors"
                          title="แก้ไขข้อมูล"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(u)}
                          className="inline-flex items-center justify-center text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 p-2 rounded-full transition-colors"
                          title="ลบผู้ใช้งาน"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="4" className="py-16 text-center text-slate-400 text-sm">ยังไม่มีผู้ใช้งานในระบบ</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && users.length > 0 && (
        <div className="mt-4">
          <Pagination page={page} pageSize={PAGE_SIZE} total={users.length} onPageChange={setPage} />
        </div>
      )}

      {/* --- Add / edit modal --- */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-card-lg w-full max-w-lg">
            <div className="p-6 flex justify-between items-center border-b border-slate-100">
              <h2 className="font-display text-xl font-semibold text-brand-800">
                {modalMode === 'create' ? 'เพิ่มผู้ใช้งานใหม่' : 'แก้ไขข้อมูลผู้ใช้งาน'}
              </h2>
              <button onClick={closeModal} className="p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors">
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className={labelCls}>ชื่อ-นามสกุล</label>
                <input type="text" name="fullName" value={form.fullName} onChange={handleChange} required className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>ชื่อผู้ใช้งาน (Username)</label>
                <input
                  type="text" name="username" value={form.username} onChange={handleChange} required
                  disabled={modalMode === 'edit'}
                  className={`${inputCls} ${modalMode === 'edit' ? 'bg-slate-100 text-slate-500' : ''}`}
                />
              </div>

              <div>
                <label className={labelCls}>อีเมล (สำหรับเพิ่มสิทธิ์ดูเอกสารใน Google Drive)</label>
                <input
                  type="email" name="email" value={form.email} onChange={handleChange}
                  className={inputCls} placeholder="เช่น teacher@gmail.com"
                />
                {modalMode === 'edit' && (
                  <p className="mt-1.5 text-xs text-slate-400">เว้นว่างไว้ถ้าไม่ต้องการเปลี่ยนอีเมลเดิม</p>
                )}
              </div>

              <div>
                <label className={labelCls}>บทบาท</label>
                <select name="role" value={form.role} onChange={handleChange} required className={`${inputCls} bg-white`}>
                  {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <p className="mt-1.5 text-xs text-slate-400">
                  {roleTiers[form.role] === 'admin'
                    ? 'บทบาทนี้เข้าถึงหน้า "จัดการผู้ใช้งาน" และฟังก์ชันของผู้ดูแลระบบได้ทั้งหมด (รวมถึงเห็นทุกรายการในหน้ารายงาน)'
                    : roleTiers[form.role] === 'full'
                    ? 'บทบาทนี้เห็นรายการของทุกคนได้ในหน้ารายงาน (ไม่ใช่แค่ของตัวเอง) แต่ไม่มีสิทธิ์จัดการผู้ใช้งานหรือลบรายการ'
                    : 'บทบาทนี้เห็นเฉพาะรายการที่ตัวเองบันทึกในหน้ารายงาน ใช้งานได้ที่แผงควบคุม บันทึกตัดคะแนน และรายงาน'}
                </p>
              </div>

              {modalMode === 'edit' && !changePassword && (
                <button
                  type="button"
                  onClick={() => setChangePassword(true)}
                  className="flex items-center gap-2 text-sm font-semibold text-brand-700 hover:text-brand-800"
                >
                  <KeyRound size={15} /> ตั้งรหัสผ่านใหม่
                </button>
              )}

              {changePassword && (
                <div>
                  <label className={labelCls}>
                    {modalMode === 'create' ? 'รหัสผ่านเริ่มต้น' : 'รหัสผ่านใหม่'}
                  </label>
                  <input
                    type="text" name="password" value={form.password} onChange={handleChange}
                    required minLength={8} className={inputCls}
                    placeholder="อย่างน้อย 8 ตัวอักษร"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={closeModal}
                  className="px-6 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors">
                  ยกเลิก
                </button>
                <button type="submit" disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl bg-brand-700 text-white font-display font-semibold hover:bg-brand-800 flex items-center gap-2 transition-colors disabled:bg-brand-400">
                  {isSaving ? <Loader2 className="animate-spin" size={19} /> : <Save size={19} />}
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
