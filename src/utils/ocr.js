// ย่อขนาดรูปก่อนแปลงเป็น base64 ส่งไปสแกน — รูปจากกล้องมือถือมักมีขนาดไฟล์ใหญ่
// มาก (หลาย MB) พอแปลงเป็น base64 แล้วส่งผ่านเน็ตมือถือที่อาจช้ากว่า WiFi คอม
// พิวเตอร์ที่ใช้ทดสอบตอนแรก ทำให้ค้างหรือหลุดกลางทางจนดูเหมือนใช้งานไม่ได้
//
// 2200px กับ quality 0.9 เป็นจุดกึ่งกลางระหว่างเร็ว (ไฟล์เล็กกว่าต้นฉบับมาก) กับ
// คมพอให้ AI อ่านตัวเลข/ตัวอักษรเล็กๆ บนบัตรได้แม่นยำ — ถ้าบัตรไม่เต็มเฟรมตอนถ่าย
// (มีพื้นหลังเยอะ) ตัวอักษรบนบัตรจะยิ่งเหลือความละเอียดน้อยลงไปอีก ควรถ่ายให้บัตร
// เต็มเฟรมและแสงสว่างพอเสมอ จะช่วยความแม่นยำได้มากกว่าการปรับค่าพวกนี้อย่างเดียว
export async function resizeImageForOcr(file, maxDimension = 2200, quality = 0.9) {
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });

    let { width, height } = img;
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    // ย่อไม่สำเร็จไม่ว่าเหตุผลใดก็ตาม ส่งไฟล์ต้นฉบับไปแทน (พฤติกรรมเดิมก่อนแก้)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

export const VALID_MAJORS = [
  "เทคโนโลยีธุรกิจดิจิทัล", "เทคโนโลยีสารสนเทศ", "ช่างเทคนิคคอมพิวเตอร์",
  "ช่างยนต์", "ช่างกลโรงงาน", "ช่างเชื่อมโลหะ", "ไฟฟ้ากำลัง", "อิเล็กทรอนิกส์",
  "ช่างก่อสร้าง", "สถาปัตยกรรม", "แมคคาทรอนิกส์และหุ่นยนต์",
  "การบัญชี", "การตลาด", "การจัดการสำนักงาน",
];

// แปลง JSON ดิบที่ AI อ่านจากบัตรนักศึกษาให้เป็นข้อมูลสะอาดพร้อมกรอกลงฟอร์ม —
// แยกออกมาจาก handleImageUpload เพราะเป็นตรรกะการแปลงข้อมูลล้วนๆ ไม่เกี่ยวกับ UI
export function parseOcrCardData(extractedData) {
  const fullText = JSON.stringify(extractedData);

  // 1. จัดการสาขาวิชา
  let cleanMajor = '';
  for (const major of VALID_MAJORS) {
    if (fullText.includes(major)) {
      cleanMajor = major;
      break;
    }
  }

  // 2. จัดการคำนำหน้า และ ชื่อ-สกุล
  let rawName = (extractedData.rawNameLine || extractedData.studentName || '')
    .replace(/ชื่อ-สกุล/g, '')
    .replace(/ชื่อ/g, '')
    .replace(/สกุล/g, '')
    .replace(/:/g, '')
    .replace(/นาg/g, 'นาง')
    // ตัดข้อความในวงเล็บทิ้งเสมอ — เจอบ่อยว่า AI แถมชื่อผู้อำนวยการ/ลายเซ็นต่อท้าย
    // ชื่อนักเรียนมาในวงเล็บ เช่น "กชนิภา ทองทิพจิรเดช(นายพุทธพร ปราโมทย์)" ซึ่งเป็น
    // ชื่อ ผอ. ที่พิมพ์อยู่ตรงลายเซ็นบนบัตร ไม่ใช่ส่วนหนึ่งของชื่อนักเรียนเลย
    .replace(/\([^)]*\)/g, '')
    .trim();

  rawName = rawName.split(/เลข|สาขา|ระดับ|[0-9]/)[0].trim();

  let cleanTitle = '';
  let cleanName = rawName;

  if (cleanName.startsWith("นางสาว")) {
    cleanTitle = "นางสาว";
    cleanName = cleanName.substring(6).trim();
  } else if (cleanName.startsWith("นาย")) {
    cleanTitle = "นาย";
    cleanName = cleanName.substring(3).trim();
  } else if (cleanName.startsWith("นาง")) {
    cleanTitle = "นาง";
    cleanName = cleanName.substring(3).trim();
  }

  // 3. จัดการรหัสนักศึกษา (11 หลัก) และ ระดับชั้น
  const idMatch = fullText.match(/\d{11}/);
  const cleanStudentId = idMatch ? idMatch[0] : '';

  let cleanLevel = '';
  if (fullText.includes('ปวช')) cleanLevel = 'ปวช.';
  if (fullText.includes('ปวส')) cleanLevel = 'ปวส.';

  return {
    studentId: cleanStudentId,
    nameTitle: cleanTitle,
    studentName: cleanName,
    fieldOfStudy: cleanMajor,
    level: cleanLevel,
  };
}
