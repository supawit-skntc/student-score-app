// src/services/api.js

// URL ของ Google Apps Script (Web App) จากระบบเดิมของคุณ
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbwVA7AWqHbWwNFSy0XrjDRjalNpKwEfbOLKJN2HNk-R_eyvOJ7MKTV-T1TS8Xqm_dnE/exec";

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
const RETRYABLE_ACTIONS = new Set([
  'login', 'logout', 'getRecords', 'getMyRecords', 'getUsers', 'getAuditLogs', 'getRpaStats',
  'addRecord',
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

export const callAPI = async (action, data = {}) => {
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
