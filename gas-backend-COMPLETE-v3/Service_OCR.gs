// ==========================================
// ไฟล์ Service_OCR.gs : สแกนบัตรนักเรียนด้วย AI (Typhoon OCR)
//
// เดิมหน้าเว็บ (DeductionForm.jsx) เรียก api.opentyphoon.ai ตรงจาก browser พร้อม
// แนบ API key ไปด้วย (VITE_TYPHOON_API_KEY) — ปัญหาคือ Vite ฝังค่าตัวแปรที่ขึ้น
// ต้นด้วย VITE_ ทุกตัวลงใน JavaScript ที่ส่งให้ผู้ใช้จริง คีย์จึงเปิดดูได้ทันทีผ่าน
// view-source/Network tab ของทุกคนที่เข้าเว็บ (ยืนยันแล้วว่าหลุดจริงในไฟล์ build)
//
// ย้าย call มาไว้ที่นี่แทน คีย์จึงอยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ไม่ถูกส่งให้ client เลย
//
// ตั้งค่าก่อนใช้งาน (ทำครั้งเดียว):
//   Apps Script Editor -> ไอคอนเฟือง "Project Settings" -> Script Properties
//   -> Add script property -> ชื่อ TYPHOON_API_KEY ค่า = คีย์จริงจาก opentyphoon.ai
// ==========================================

function scanStudentCard(token, base64Image) {
  requireSession(token);

  if (!base64Image) {
    return { status: "error", message: "ไม่พบข้อมูลรูปภาพที่ส่งมา" };
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty('TYPHOON_API_KEY');
  if (!apiKey) {
    return { status: "error", message: "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า TYPHOON_API_KEY (Script Properties)" };
  }

  const payload = {
    model: "typhoon-ocr",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `ดึงข้อมูลจากบัตรนักศึกษาใบนี้ ตอบกลับเป็น JSON เท่านั้น ห้ามอธิบายเพิ่มเติม

                    ⚠️ ข้อควรระวังสำคัญ: บัตรนักศึกษามักมีชื่อคนอยู่ 2 จุดที่แตกต่างกันโดยสิ้นเชิง
                    - ชื่อของ "นักเรียน/นักศึกษาเจ้าของบัตร" อยู่ในบล็อกข้อมูลหลักของบัตร ต่อจาก
                      คำว่า "เลขประจำตัว" และ "ชื่อ-สกุล"
                    - ชื่อของ "ผู้อำนวยการ" หรือผู้มีอำนาจลงนามอนุมัติบัตร มักอยู่แยกต่างหาก ใกล้
                      ลายเซ็น ตราประทับ หรือข้อความ "ผู้อำนวยการ"/"ผอ." — ห้ามดึงชื่อจากบริเวณนี้
                      มาใส่ในช่องชื่อนักเรียนเด็ดขาด แม้ตัวหนังสือจะชัดกว่าชื่อนักเรียนก็ตาม

                    ⚠️ ข้อควรระวังอีกจุด: บัตรมีเลขประจำตัว 2 ชุดที่ขึ้นต้นคำคล้ายกันมากจนสับสน
                    ง่าย อยู่ใกล้กัน — "เลขประจำตัว" (11 หลัก ของนักเรียน/นักศึกษา ใช้ช่องนี้
                    เท่านั้น) กับ "เลขประจำตัวประชาชน" (13 หลัก ของบัตรประชาชน ห้ามใช้เด็ดขาด
                    แม้จะอยู่ใกล้กันหรือชัดกว่า) นับจำนวนหลักให้แน่ใจก่อนตอบเสมอ

                    1. studentId: ตัวเลข 11 หลัก ที่อยู่ติดกับคำว่า "เลขประจำตัว" ในบล็อกข้อมูล
                       นักเรียน/นักศึกษาเท่านั้น (ไม่ใช่ "เลขประจำตัวประชาชน" ที่มี 13 หลัก — ดู
                       ข้อควรระวังด้านบน) ถ้านับหลักแล้วไม่ครบ 11 หรือไม่แน่ใจ ให้ตอบค่าว่าง ""
                       ดีกว่าเดา
                    2. rawNameLine: ข้อความทั้งหมดที่อยู่บรรทัดเดียวกับคำว่า "ชื่อ-สกุล" ในบล็อก
                       ข้อมูลนักเรียน/นักศึกษาเท่านั้น (ตั้งแต่คำนำหน้าไปจนจบชื่อ) — ถ้าไม่แน่ใจว่า
                       เป็นชื่อนักเรียนจริงหรือชื่อผู้อำนวยการ/ลายเซ็น ให้ตอบเป็นค่าว่าง "" ดีกว่าเดา
                    3. rawMajorLine: ดึงข้อความทั้งหมดที่อยู่หลังคำว่า "สาขาวิชา"
                    4. level: ดึงคำว่า ปวช. หรือ ปวส.

                    รูปแบบ (JSON เท่านั้น ไม่มีข้อความอื่นปน):
                    { "studentId": "...", "rawNameLine": "...", "rawMajorLine": "...", "level": "..." }`,
          },
          { type: "image_url", image_url: { url: base64Image } },
        ],
      },
    ],
    max_tokens: 500,
    temperature: 0.1,
  };

  try {
    const response = UrlFetchApp.fetch("https://api.opentyphoon.ai/v1/chat/completions", {
      method: "post",
      contentType: "application/json",
      headers: { "Authorization": "Bearer " + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      // 🐢 429 = ถูก rate limit ฝั่ง Typhoon (ใช้งานถี่เกินโควตาแผนที่สมัครไว้ชั่วคราว)
      // ต่างจาก error อื่นๆ ตรงที่ "ลองใหม่อีกครู่" มักจะหายเอง ไม่ใช่ปัญหาที่ต้อง
      // แก้โค้ด/ตั้งค่าใหม่ — แยกข้อความให้ชัดเจนกว่าเดิม กันสับสนว่าเป็นบั๊ก
      if (code === 429) {
        return { status: "error", message: "AI กำลังถูกใช้งานหนักเกินไปในขณะนี้ กรุณารอสักครู่แล้วลองสแกนใหม่อีกครั้ง" };
      }
      return { status: "error", message: "เรียก AI ไม่สำเร็จ (HTTP " + code + ")" };
    }

    const data = JSON.parse(response.getContentText());
    const resultText = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : "";

    return { status: "success", raw: resultText };
  } catch (e) {
    return { status: "error", message: "เรียก AI ไม่สำเร็จ: " + e.message };
  }
}
