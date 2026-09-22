// รายการฐานความผิด + คะแนนตัดเริ่มต้น — เดิมไฟล์นี้ hardcode ข้อมูลชุดนี้เอง ซ้ำ
// กับ checkbox mapping ใน gas-backend-COMPLETE-v3/Service_PDF.gs (และ
// NO_REPEAT_SAME_DAY_OFFENSES ใน Service_Records.gs) เสี่ยงแก้ที่เดียวแล้วอีกที่
// ไม่ตรงกันแบบเงียบๆ (เช่น PDF ติ๊กผิดช่องโดยไม่มี error เตือน) ตอนนี้เซิร์ฟเวอร์
// เป็นเจ้าของข้อมูลจริงที่เดียว (ดู OFFENSES ใน Config.gs) ไฟล์นี้แค่ดึงมาผ่าน
// action "getOffenses" + แคชไว้ใน localStorage กันจอว่างตอนเปิดแอปครั้งถัดไป
// ก่อน fetch จะเสร็จ (แพตเทิร์นเดียวกับ currentUser)
import { callAPI } from '../services/api';

const OFFENSES_CACHE_KEY = 'offensesCache';

function readCachedOffenses() {
  try {
    const raw = localStorage.getItem(OFFENSES_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ค่าเริ่มต้นตอน import โมดูลนี้ — ใช้เป็น initial state ของ useState ใน
// คอมโพเนนต์ที่ต้องใช้รายการนี้ (DeductionForm/Report/EditRecordModal) ระหว่าง
// รอ fetchOffenses() ด้านล่างทำงานเสร็จ
export const CACHED_OFFENSES = readCachedOffenses();

// เรียกใน useEffect ของทุกหน้าที่ต้องใช้รายการนี้ — ปลอดภัยที่จะเรียกซ้ำได้เสมอ
// (แค่อ่านอย่างเดียว ไม่เขียนข้อมูล) ผลลัพธ์แคช 15 วิฝั่งเว็บอยู่แล้วผ่าน api.js
export async function fetchOffenses() {
  const result = await callAPI('getOffenses', {});
  if (result.status === 'success' && Array.isArray(result.data)) {
    try {
      localStorage.setItem(OFFENSES_CACHE_KEY, JSON.stringify(result.data));
    } catch {
      // เขียน localStorage ไม่ได้ (โหมดส่วนตัว/พื้นที่เต็ม) ไม่ควรทำให้ฟังก์ชัน
      // หลักพังตาม — ปล่อยผ่าน ใช้ผลลัพธ์สดที่ได้มาตามปกติ ไม่ได้แคชไว้เฉยๆ
    }
    return result.data;
  }
  return CACHED_OFFENSES;
}

export function findOffense(offenses, label) {
  return offenses.find((o) => o.label === label);
}
