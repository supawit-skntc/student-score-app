import { useCallback, useSyncExternalStore } from 'react';

// ใช้เรนเดอร์ "เฉพาะเลย์เอาต์ที่ใช้อยู่จริง" แทนการเรนเดอร์ทั้งสองแบบแล้วซ่อนอีกอันด้วย
// CSS (hidden md:block / md:hidden) — แบบหลังทำให้เบราว์เซอร์ (โดยเฉพาะมือถือ) ต้อง
// สร้าง DOM ของตารางและการ์ดพร้อมกันทุกครั้งที่ข้อมูลเปลี่ยน ทั้งที่เห็นแค่อย่างเดียว
export function useMediaQuery(query) {
  const subscribe = useCallback((onChange) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
