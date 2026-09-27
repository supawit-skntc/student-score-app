import { useEffect, useRef } from 'react';

// 🔒 ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน 5 นาที (คำขอ 27/9/69 — คอมเมนต์ผู้เชี่ยวชาญ: อยากได้พฤติกรรม
// แบบแอปธนาคาร) นับจาก "เวลาจริงที่ผ่านไปนับจากกิจกรรมล่าสุด" (เทียบ timestamp ใน localStorage ทุก 10 วินาที)
// ไม่ใช่ตัวจับเวลาเดี่ยวที่รีเซ็ตทุกครั้งที่มี event เฉยๆ เพื่อให้:
//   1. ทำงานถูกต้องแม้เปิดหลายแท็บพร้อมกัน — กิจกรรมในแท็บหนึ่งนับให้ทุกแท็บ ไม่เด้งออกทั้งที่อีกแท็บกำลังใช้อยู่
//   2. นับเวลาต่อเนื่องแม้แท็บอยู่เบื้องหลัง/เบราว์เซอร์ throttle timer (setInterval ของแท็บพื้นหลังอาจเลื่อนได้
//      บ้าง แต่ยังเทียบกับเวลาจริงเสมอ ไม่ใช่นับจำนวนรอบ interval ที่ผ่านมา)
const IDLE_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 10000;
const THROTTLE_MS = 1000; // กันเขียน localStorage ถี่เกินไปตอนขยับเมาส์รัวๆ
const LAST_ACTIVITY_KEY = 'lastActivityAt';
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart'];

export function useIdleLogout(enabled, onIdle) {
  const lastMarkedRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;

    const markActivity = () => {
      const now = Date.now();
      if (now - lastMarkedRef.current < THROTTLE_MS) return;
      lastMarkedRef.current = now;
      try { localStorage.setItem(LAST_ACTIVITY_KEY, String(now)); } catch { /* โหมดส่วนตัว/พื้นที่เก็บเต็ม — ไม่กระทบการทำงานหลัก */ }
    };

    markActivity(); // เริ่มนับตั้งแต่เปิด/สลับมาหน้านี้ ไม่ใช้เวลากิจกรรมเก่าที่ค้างจากเซสชันก่อน
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, markActivity, { passive: true }));

    const intervalId = setInterval(() => {
      let lastActivity = lastMarkedRef.current;
      try {
        const stored = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0', 10);
        if (stored > lastActivity) lastActivity = stored; // แท็บอื่นเพิ่งมีกิจกรรมล่าสุดกว่า
      } catch { /* อ่านไม่ได้ก็ใช้ค่าที่มีในแท็บนี้ต่อไป */ }
      if (lastActivity && Date.now() - lastActivity >= IDLE_MS) {
        onIdle();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, markActivity));
      clearInterval(intervalId);
    };
  }, [enabled, onIdle]);
}
