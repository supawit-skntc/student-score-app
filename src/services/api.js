// src/services/api.js

// URL ของ Google Apps Script (Web App) จากระบบเดิมของคุณ
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbw3kcF6YNAm_lq_UrLLL5YoCtY1wrJPo8AlLh2VSWLJbnRfB8cgJXYtF2jR8fOXVZtP/exec";

// Google เด้งหน้า HTML กลับมาแทน JSON เป็นครั้งคราวโดยไม่มีสาเหตุจากโค้ดเราเลย
// (เจอมาแล้วหลายครั้ง ทั้งฝั่งเว็บนี้และฝั่งบอท RPA) ลองใหม่อัตโนมัติสั้นๆ ก่อนจะ
// ถือว่าพังจริง ลดโอกาสที่ผู้ใช้จะเห็น error ที่จริงๆ หายไปเองถ้ารอสักครู่
//
// ⚠️ ลองใหม่ได้เฉพาะ action ที่ "อ่านอย่างเดียว" หรือ action ที่ทำให้ปลอดภัยต่อ
// การส่งซ้ำแล้วจริงๆ (idempotent) เท่านั้น — ถ้า action เขียนข้อมูลแล้ว response
// หลุดหายไปกลางทาง เราไม่มีทางรู้จากฝั่งเว็บว่าจริงๆ แล้วเซิร์ฟเวอร์บันทึกสำเร็จไป
// แล้วหรือยัง การลองใหม่อัตโนมัติแบบไม่ระวังอาจทำให้บันทึกซ้ำซ้อนได้
//
// 'addRecord' ปลอดภัยแล้วเพราะแนบ clientRequestId ไปด้วยทุกครั้ง (ดู
// DeductionForm.jsx + findRecordByClientRequestId_ ใน Service_Records.gs) —
// ฝั่งเซิร์ฟเวอร์เช็กก่อนเสมอว่ารหัสนี้เคยบันทึกไปแล้วหรือยัง ถ้าเคยแล้วจะตอบ
// สำเร็จกลับมาเฉยๆ ไม่สร้างรายการซ้ำ ต่อให้ลองส่งซ้ำกี่ครั้งก็ตาม — action อื่นที่
// เขียนข้อมูล (updateRecord, createUser ฯลฯ) ยังไม่มีกลไกนี้ จึงยังห้ามลองใหม่เอง
//
// 'generateRecordPdf' ก็ปลอดภัยเช่นกัน (ดู generatePdfForRow_ ใน Service_PDF.gs)
// เพราะเช็กก่อนเสมอว่ารายการนี้มี PDF อยู่แล้วหรือยัง ถ้ามีแล้วจะคืนลิงก์เดิมกลับมา
// เฉยๆ ไม่สร้างไฟล์ซ้ำ ต่อให้เรียกซ้ำกี่ครั้งก็ตาม
//
// 🐛 'ocrScan' เคยตกหล่นไม่ได้อยู่ในลิสต์นี้มาตลอด — เป็นแค่การ "อ่าน" รูปภาพแล้ว
// ส่งข้อความกลับ ไม่เขียนข้อมูลอะไรเลย ปลอดภัยที่จะลองใหม่ยิ่งกว่า action อื่นๆ ใน
// ลิสต์นี้เสียอีก การไม่มี retry ทำให้ error ตอบกลับหาย (ปัญหาเดียวกับที่เจอกับปุ่ม
// บันทึกข้อมูล) ขึ้นมาเป็น error 404 ให้ครูเห็นทันทีโดยไม่มีการลองใหม่อัตโนมัติเลย
const RETRYABLE_ACTIONS = new Set([
  'login', 'logout', 'getRecords', 'getMyRecords', 'getUsers', 'getAuditLogs', 'getRpaStats',
  'getOffenses', 'getRoleTiers', 'getProbationStatus',
  'addRecord', 'generateRecordPdf', 'ocrScan',
]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getStoredToken() {
  try {
    const stored = localStorage.getItem('currentUser');
    return stored ? JSON.parse(stored).token : null;
  } catch {
    return null;
  }
}

// ⚡ แคชผลลัพธ์ของ action ที่ "อ่านอย่างเดียว" ไว้สั้นๆ ฝั่งเบราว์เซอร์ — สาเหตุที่
// ทุกหน้า (Dashboard/Report/ประวัตินักเรียน) รู้สึกช้าไม่ใช่เพราะข้อมูลในชีตเยอะ
// แต่เป็นต้นทุนคงที่ ~2 วินาทีต่อการเรียก Apps Script Web App 1 ครั้ง (ยืนยันแล้ว
// จากแท็บ Executions) แคชฝั่งเซิร์ฟเวอร์ (30 วินาที) จึงช่วยเรื่องนี้ไม่ได้เลยเพราะ
// ยังต้องยิง request ไปกลับอยู่ดี — การแคชฝั่งนี้ตัด request ทิ้งไปเลยถ้าเพิ่งเรียก
// action เดิมไปหมาดๆ ทำให้สลับหน้าไปมาเร็วขึ้นจริง (0ms แทน ~2 วินาที)
//
// อายุแคชสั้นกว่าฝั่งเซิร์ฟเวอร์ (15 วิ < 30 วิ) เพื่อให้เห็นข้อมูลใหม่ไม่ช้ากว่าเดิม
// มาก และล้างแคชทั้งหมดทันทีเมื่อมี action เขียนข้อมูลสำเร็จ (ปลอดภัยไว้ก่อน ไม่
// ต้องคิดว่า action ไหนกระทบ cache key ไหนบ้าง)
const READ_CACHEABLE_ACTIONS = new Set(['getRecords', 'getMyRecords', 'getUsers', 'getAuditLogs', 'getRpaStats', 'getOffenses', 'getRoleTiers', 'getProbationStatus']);
const WRITE_ACTIONS = new Set(['addRecord', 'updateRecord', 'deleteRecord', 'createUser', 'updateUser', 'deleteUser', 'generateRecordPdf', 'addProbationRecord']);
const READ_CACHE_TTL_MS = 15000;

// 'getOffenses'/'getRoleTiers' แทบไม่เปลี่ยนเลย (ผูกกับระเบียบวิทยาลัย/เทมเพลต
// PDF ที่แก้กันปีละไม่กี่ครั้ง) ต่างจาก getRecords/getMyRecords ที่ต้องสดใหม่เสมอ
// — ถ้าใช้ TTL 15 วิเท่ากัน ครูที่กรอกฟอร์มนานกว่า 15 วิ (เรื่องปกติ) แล้วสลับไป
// หน้ารายงานจะเจอแคชหมดอายุ ต้องเสีย ~2 วิ ไปกับข้อมูลที่ไม่ได้เปลี่ยนเลยจริงๆ
// (ก่อน refactor นี้ข้อมูลชุดนี้เป็น static import ต้นทุน 0 เสมอ) — ยืดอายุแคช
// เฉพาะ 2 action นี้ให้ยาวขึ้นแทน กันความช้าที่เพิ่มมาโดยไม่จำเป็น
const READ_CACHE_TTL_OVERRIDES_MS = {
  getOffenses: 5 * 60 * 1000,
  getRoleTiers: 5 * 60 * 1000,
};
const readCache = new Map();

function cacheTtlFor(action) {
  return READ_CACHE_TTL_OVERRIDES_MS[action] || READ_CACHE_TTL_MS;
}

function readCacheKey(action) {
  // getMyRecords/getUsers ฯลฯ ขึ้นกับสิทธิ์ของผู้ใช้ที่ login อยู่ ต้องรวม token
  // เข้าไปในคีย์ด้วย กันเห็นแคชค้างของผู้ใช้คนอื่นถ้ามีการสลับบัญชีในเบราว์เซอร์เดียวกัน
  return `${action}:${getStoredToken() || ''}`;
}

export const callAPI = async (action, data = {}) => {
  if (READ_CACHEABLE_ACTIONS.has(action)) {
    const cached = readCache.get(readCacheKey(action));
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  const result = await callAPIUncached(action, data);

  if (result && result.status === 'success') {
    if (READ_CACHEABLE_ACTIONS.has(action)) {
      readCache.set(readCacheKey(action), { result, expiresAt: Date.now() + cacheTtlFor(action) });
    } else if (WRITE_ACTIONS.has(action) || action === 'login' || action === 'logout') {
      readCache.clear();
    }
  }

  return result;
};

const callAPIUncached = async (action, data = {}) => {
  const maxAttempts = RETRYABLE_ACTIONS.has(action) ? MAX_ATTEMPTS : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts;

    try {
      const response = await fetch(GAS_API_URL, {
        method: "POST",
        headers: {
          // ใช้ text/plain เพื่อหลีกเลี่ยงปัญหา CORS ใน Google Apps Script
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
          action,
          // แนบ session token อัตโนมัติทุกคำขอ (ยกเว้น login ที่ยังไม่มี token)
          // เพื่อให้ GAS backend ตรวจสอบสิทธิ์ก่อนทำงานทุกครั้ง
          token: action === "login" ? undefined : getStoredToken(),
          ...data,
        }),
      });

      const text = await response.text();

      if (!response.ok) {
        // เก็บเนื้อหาดิบ (มักเป็นหน้า HTML ของ Google) ไว้ใน console สำหรับ
        // ตรวจสอบทีหลังเท่านั้น — ไม่โชว์ให้ผู้ใช้เห็นเพราะอ่านไม่รู้เรื่องและ
        // ทำให้ตกใจโดยใช่เหตุ
        console.error(`API HTTP Error ${response.status} (action: ${action}, attempt ${attempt}/${maxAttempts}):`, text);
        if (!isLastAttempt) { await sleep(RETRY_DELAY_MS * attempt); continue; }
        return { status: "error", message: `เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (รหัส ${response.status}) — เซิร์ฟเวอร์อาจกำลังหนาแน่นชั่วคราว กรุณาลองใหม่อีกครั้ง` };
      }

      let result;
      try {
        result = JSON.parse(text);
      } catch {
        console.error(`JSON Parse Error (action: ${action}, attempt ${attempt}/${maxAttempts}):`, text);
        if (!isLastAttempt) { await sleep(RETRY_DELAY_MS * attempt); continue; }
        return { status: "error", message: "เซิร์ฟเวอร์ไม่ได้ตอบกลับเป็นรูปแบบที่ถูกต้อง — กรุณาลองใหม่อีกครั้ง" };
      }

      // เซสชันหมดอายุ/ไม่ถูกต้อง -> เคลียร์ข้อมูลและบังคับกลับหน้า login
      if (result.status === "error" && /เซสชัน/.test(result.message || "")) {
        localStorage.removeItem("currentUser");
        window.location.reload();
      }

      return result;
    } catch (err) {
      console.error(`API Call Error (action: ${action}, attempt ${attempt}/${maxAttempts}):`, err);
      if (!isLastAttempt) { await sleep(RETRY_DELAY_MS * attempt); continue; }
      return { status: "error", message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต" };
    }
  }
};
