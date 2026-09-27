// ปิดบังชื่อนักเรียนในหน้าแผงควบคุม (การ์ด "นักเรียนที่ถึงเกณฑ์ต้องดำเนินการ" และ "คะแนนสะสมสูงสุด")
// เพราะเป็นข้อมูลที่มองเห็นได้ทันทีตั้งแต่เปิดหน้าแรก ไม่ต้องกดค้นหาก่อนเหมือนหน้ารายงาน/ประวัตินักเรียน
// (คอมเมนต์จากอาจารย์ผู้เชี่ยวชาญ: คล้ายการซ่อนยอดเงินในแอปธนาคาร ต้องกดเพื่อดูอีกที)
//
// ค่าที่ซ่อนใช้จำนวนจุดคงที่เสมอ (ไม่ใช่ความยาวของชื่อจริง) กันไม่ให้ความยาวชื่อที่ปิดบังหลุดไปบอกใบ้ชื่อจริง
const TITLES = ["นางสาว", "นาย", "นาง", "เด็กชาย", "เด็กหญิง"];
const MASK = "•••••";

export function maskThaiName(fullName) {
  const name = String(fullName || "").trim();
  if (!name) return name;

  const title = TITLES.find((t) => name.startsWith(t)) || "";
  const rest = name.slice(title.length).trim();
  if (!rest) return title ? `${title} ${MASK}` : MASK;

  // เก็บตัวอักษรแรกของแต่ละคำ (ชื่อ/นามสกุล) ไว้ให้พอเดารู้ว่าเป็นคนละคนกัน โดยไม่เผยชื่อเต็ม
  const maskedWords = rest.split(/\s+/).map((w) => (w ? w[0] + MASK : w));
  return [title, ...maskedWords].filter(Boolean).join(" ").trim();
}
