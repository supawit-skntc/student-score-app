// src/services/api.js

// URL ของ Google Apps Script (Web App) จากระบบเดิมของคุณ
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbyCKmdG_XuiM7hC2FUf0V1yWXvAYJ43vptgSiliMkVC3-MKzbG0qepkiA1bgUIDzSu3/exec";

function getStoredToken() {
  try {
    const stored = localStorage.getItem('currentUser');
    return stored ? JSON.parse(stored).token : null;
  } catch {
    return null;
  }
}

export const callAPI = async (action, data = {}) => {
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
      return { status: "error", message: `HTTP Error: ${response.status}\n${text}` };
    }

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      console.error("JSON Parse Error:", text);
      return { status: "error", message: "เซิร์ฟเวอร์ไม่ได้ตอบกลับเป็นรูปแบบ JSON" };
    }

    // เซสชันหมดอายุ/ไม่ถูกต้อง -> เคลียร์ข้อมูลและบังคับกลับหน้า login
    if (result.status === "error" && /เซสชัน/.test(result.message || "")) {
      localStorage.removeItem("currentUser");
      window.location.reload();
    }

    return result;
  } catch (err) {
    console.error("API Call Error:", err);
    return { status: "error", message: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต" };
  }
};