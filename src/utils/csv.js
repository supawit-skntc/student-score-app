// สร้างและดาวน์โหลดไฟล์ CSV จากข้อมูลที่โหลดมาอยู่แล้วในหน้าเว็บ (ไม่ต้องยิง
// request ใหม่ไปเซิร์ฟเวอร์) — ใช้ร่วมกันได้กับทุกหน้าที่อยากมีปุ่ม export

function escapeCsvCell(value) {
  const str = String(value ?? '');
  // ครอบด้วย " เฉพาะเซลล์ที่มีจุลภาค/เครื่องหมายคำพูด/ขึ้นบรรทัดใหม่ ตามมาตรฐาน CSV
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const CSV_BOM = String.fromCharCode(0xFEFF);

export function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  // ใส่ BOM นำหน้าเสมอ — ถ้าไม่ใส่ Excel บน Windows จะเปิดภาษาไทยเป็นตัวอักษร
  // มั่วเพราะเข้าใจผิดว่าไฟล์เป็น ANSI ไม่ใช่ UTF-8
  const csvContent = CSV_BOM + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
