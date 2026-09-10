import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { Loader2 } from 'lucide-react';
import { callAPI } from '../services/api';

export default function Login({ setView }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!username || !password) {
      Swal.fire({ icon: 'warning', title: 'แจ้งเตือน', text: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
      return;
    }

    setIsLoading(true);

    try {
      const result = await callAPI('login', { username, password });

      if (result.status === 'success') {
        // เก็บ token รวมไว้ในอ็อบเจกต์เดียวกับ user เพื่อให้ api.js
        // ดึงไปแนบกับทุก request อัตโนมัติ (ดู services/api.js)
        localStorage.setItem('currentUser', JSON.stringify({ ...result.user, token: result.token }));

        Swal.fire({
          icon: 'success',
          title: 'ยินดีต้อนรับ',
          text: result.message,
          timer: 1500,
          showConfirmButton: false,
        }).then(() => {
          setView('dashboard');
        });
      } else {
        Swal.fire({ icon: 'error', title: 'เข้าสู่ระบบล้มเหลว', text: result.message });
      }
    } catch {
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-9 font-sans bg-[radial-gradient(120%_90%_at_15%_0%,#742537_0%,#4A1624_45%,#38101A_100%)]">

      {/* ambient brand texture */}
      <div className="pointer-events-none absolute -top-[140px] -left-[120px] h-[420px] w-[420px] rounded-full bg-gold-500/[0.16] blur-[70px]" />
      <div className="pointer-events-none absolute -bottom-[160px] -right-[100px] h-[380px] w-[380px] rounded-full bg-white/[0.07] blur-[70px]" />

      <div className="relative w-full max-w-[400px]">

        <div className="mb-[22px] flex flex-col items-center text-center">
          <img
            src="/logo-skntc.png"
            alt="ตราวิทยาลัยเทคนิคสมุทรสาคร"
            className="h-[78px] w-[78px] object-contain [filter:drop-shadow(0_8px_18px_rgba(0,0,0,.35))]"
          />
          <h1 className="mt-3.5 font-display text-[22px] font-medium tracking-[-0.2px] text-white">วิทยาลัยเทคนิคสมุทรสาคร</h1>
          <div className="mt-1.5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-[5px] text-[12.5px] text-brand-100">
            <span className="h-1.5 w-1.5 rounded-full bg-gold-300" />
            ระบบตัดคะแนนความประพฤติ
          </div>
        </div>

        <div className="rounded-[22px] bg-white px-6 pt-[26px] pb-6 shadow-login">
          <div className="font-display text-[17px] font-medium text-ink">เข้าสู่ระบบ</div>
          <div className="mt-1 text-[13px] text-ink-mute">สำหรับครูงานปกครองและผู้ดูแลระบบ</div>

          <form onSubmit={handleLogin} className="mt-5 flex flex-col gap-4">
            <label className="block">
              <span className="mb-[7px] block text-[13.5px] font-semibold text-ink-soft">ชื่อผู้ใช้งาน</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="กรอกชื่อผู้ใช้งาน"
                className="min-h-[50px] w-full rounded-[14px] border-[1.5px] border-[#E3D9DA] bg-field px-[15px] py-[13px] text-[15px] outline-none transition focus:border-brand-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(228,187,92,.35)]"
              />
            </label>

            <label className="block">
              <span className="mb-[7px] block text-[13.5px] font-semibold text-ink-soft">รหัสผ่าน</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="min-h-[50px] w-full rounded-[14px] border-[1.5px] border-[#E3D9DA] bg-field px-[15px] py-[13px] text-[15px] tracking-[2px] outline-none transition focus:border-brand-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(228,187,92,.35)]"
              />
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className={`mt-1 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] font-display text-[16px] font-medium text-white shadow-[0_10px_22px_-10px_rgba(92,29,44,.9)] transition active:translate-y-px
                ${isLoading ? 'cursor-not-allowed bg-brand-400' : 'bg-gradient-to-b from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600'}`}
            >
              {isLoading ? <Loader2 className="animate-spin" size={19} /> : null}
              {isLoading ? 'กำลังตรวจสอบข้อมูล...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>

        <p className="mt-[18px] text-center text-[11.5px] leading-[1.7] text-brand-100/60">
          งานปกครองและความปลอดภัย นักเรียน นักศึกษา<br />วิทยาลัยเทคนิคสมุทรสาคร
        </p>
      </div>
    </div>
  );
}
