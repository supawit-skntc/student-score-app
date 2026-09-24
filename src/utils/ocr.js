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

// สาขาวิชาของ ปวช. กับ ปวส. เป็นคนละชุดกัน (ชื่อสาขาระดับสูงกว่าเปลี่ยนไปตาม
// ระบบทวิภาคี/สายเทคนิค) จึงแยกลิสต์กันไว้ตามระดับ ไม่รวมโชว์เป็นชุดเดียวยาวๆ
// เพราะจะทำให้หน้าฟอร์มดูรกเกินจำเป็น (ดู MAJORS_BY_LEVEL ด้านล่าง — ฟอร์มเลือก
// แสดงเฉพาะสาขาของระดับที่เลือกไว้ ณ ขณะนั้นเท่านั้น)
const MAJORS_PVC = [
  "เทคโนโลยีธุรกิจดิจิทัล", "เทคโนโลยีสารสนเทศ", "ช่างเทคนิคคอมพิวเตอร์",
  "ช่างยนต์", "ช่างกลโรงงาน", "ช่างเชื่อมโลหะ", "ไฟฟ้ากำลัง", "อิเล็กทรอนิกส์",
  "ช่างก่อสร้าง", "สถาปัตยกรรม", "เมคคาทรอนิกส์และหุ่นยนต์",
  "การบัญชี", "การตลาด", "การจัดการสำนักงานดิจิทัล",
];

const MAJORS_PVS = [
  "เทคนิคเครื่องกล", "เทคนิคการผลิต", "เทคนิคโลหะ", "ไฟฟ้า",
  "ช่างก่อสร้าง", "เทคนิคสถาปัตยกรรม", "เมคคาทรอนิกส์และหุ่นยนต์",
  "เทคโนโลยีคอมพิวเตอร์", "การบัญชี", "การตลาด", "เทคโนโลยีธุรกิจดิจิทัล",
  "การจัดการธุรกิจค้าปลีก", "การจัดการสำนักงานดิจิทัล", "เทคโนโลยีสารสนเทศ",
];

export const MAJORS_BY_LEVEL = {
  "ปวช.": MAJORS_PVC,
  "ปวส.": MAJORS_PVS,
};

// รวมทุกสาขาจากทั้งสองระดับไว้ชุดเดียว (ตัดชื่อซ้ำออก) — ใช้เฉพาะตอนจับคู่ข้อความ
// ที่ AI อ่านได้จากบัตรนักศึกษาเท่านั้น (parseOcrCardData ด้านล่าง) เพราะตอนสแกน
// ยังไม่รู้ล่วงหน้าว่าบัตรใบนั้นเป็นของ ปวช. หรือ ปวส. กว่าจะรู้ระดับก็ต้องอ่านจาก
// ข้อความในบัตรพร้อมๆ กันนั่นแหละ — ห้ามใช้ตัวแปรนี้ไปแสดงเป็นตัวเลือกในฟอร์มเด็ดขาด
// (ใช้ MAJORS_BY_LEVEL[level] แทนเสมอ ไม่งั้นจะกลับไปดูรกเหมือนก่อนแยกลิสต์)
const ALL_MAJORS = [...new Set([...MAJORS_PVC, ...MAJORS_PVS])];

// แปลง JSON ดิบที่ AI อ่านจากบัตรนักศึกษาให้เป็นข้อมูลสะอาดพร้อมกรอกลงฟอร์ม —
// แยกออกมาจาก handleImageUpload เพราะเป็นตรรกะการแปลงข้อมูลล้วนๆ ไม่เกี่ยวกับ UI
//
// ⚠️ studentId/level/สาขาวิชา ด้านล่างเชื่อฟิลด์ที่ AI แยกมาให้แล้วโดยตรงก่อนเสมอ
// (ไม่ค้นหาจาก fullText ทั้งก้อนเป็นหลักเหมือนเดิม) เพราะบัตรนักศึกษามีข้อความที่
// สับสนกันได้ง่ายอยู่ใกล้ๆ กัน เช่น "เลขประจำตัว" (11 หลัก) กับ "เลขประจำตัว
// ประชาชน" (13 หลัก) — ถ้าค้นทั้งก้อนเจอเลข 11 หลักที่ไหนก็ได้ในข้อความทั้งหมด
// (รวมถึงเลขที่หลุดมาจากฟิลด์อื่นโดยไม่ตั้งใจตอน AI อ่านผิด) เสี่ยงกรอกผิดคนได้
// fullText ยังเก็บไว้ใช้เป็น fallback สุดท้ายเท่านั้น เผื่อฟิลด์ที่ AI แยกมาให้
// ว่างเปล่า/ผิดรูปแบบไปเลย
export function parseOcrCardData(extractedData) {
  const fullText = JSON.stringify(extractedData);

  // บัตรประจำตัวออนไลน์ (ภาพแคปหน้าจอมือถือ) มีแค่รูป ชื่อ และเลขประจำตัว — ไม่มีคำนำหน้า
  // สาขาวิชา หรือระดับ พิมพ์อยู่เลย ถ้า AI ตอบสาขา/ระดับมาให้ แปลว่าเดาเอง จึงทิ้งทั้งหมด
  // (ปล่อยว่างให้ครูเลือกเอง ดีกว่ากรอกค่าที่ไม่มีอยู่บนบัตรจริง)
  const isOnlineCard = String(extractedData.cardType || '').toLowerCase().includes('online');

  // 1. จัดการสาขาวิชา — จับคู่จาก rawMajorLine ที่ AI แยกมาให้ก่อนเสมอ (ไม่ใช่
  // ค้นทั้งก้อน) รวมกับสาขาของทั้ง ปวช. และ ปวส. เพราะยังไม่รู้ระดับของบัตรใบนี้
  // ล่วงหน้า (ดูคำอธิบาย ALL_MAJORS ด้านบน)
  // เทียบโดยตัดช่องว่างทิ้งทั้งสองฝั่ง — AI ชอบแทรกช่องว่างกลางชื่อสาขา (เช่น "เทคโนโลยี
  // ธุรกิจดิจิทัล") ทำให้ includes() ตรงตัวหาไม่เจอแล้วสาขากลายเป็นค่าว่างทั้งที่อ่านได้ถูก
  // (ทดสอบกับ AI จริงเจอ 1 ใน 3 รอบของบัตรใบเดียวกัน)
  const squash = (s) => String(s).replace(/\s+/g, '');
  const majorSearchText = squash(extractedData.rawMajorLine || fullText);
  let cleanMajor = '';
  for (const major of isOnlineCard ? [] : ALL_MAJORS) {
    if (majorSearchText.includes(squash(major))) {
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

  rawName = rawName.split(/เลข|สาขา|ระดับ|[0-9]/)[0];
  // บัตรออนไลน์: เก็บเฉพาะตัวอักษรไทยและช่องว่าง กันข้อความบนแถบเบราว์เซอร์ (เช่น ชื่อเว็บ)
  // ที่ AI อ่านติดมากับชื่อ
  if (isOnlineCard) rawName = rawName.replace(/[^\u0E00-\u0E7F\s]/g, '');
  // บัตรพิมพ์ช่องว่าง "สองช่อง" คั่นระหว่างชื่อกับนามสกุล (ยืนยันจากบัตรจริง) — ยุบ
  // ให้เหลือช่องเดียวเสมอ ไม่งั้นชื่อที่เก็บลงชีตมีช่องว่างซ้อน ทำให้ค้นด้วยชื่อที่พิมพ์
  // ช่องเดียว (s.name.includes(...) ในหน้าประวัตินักเรียน/รายงาน) ไม่เจอ
  rawName = rawName.replace(/\s+/g, ' ').trim();

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

  // 3. จัดการรหัสนักศึกษา (11 หลัก) — เชื่อฟิลด์ studentId ที่ AI แยกมาให้ก่อน
  // เสมอ (ตัดอักขระที่ไม่ใช่ตัวเลขทิ้งเผื่อมีขีด/เว้นวรรคปน) ถ้าไม่ใช่เลข 11 หลัก
  // จริงๆ (ว่าง/มีตัวอักษรปนจนตัดแล้วยังไม่ครบ) ค่อย fallback ไปหาในข้อความทั้ง
  // ก้อนเป็นทางเลือกสุดท้าย — ดูคำอธิบายเต็มด้านบนว่าทำไมห้ามค้นทั้งก้อนเป็นหลัก
  const rawStudentIdDigits = String(extractedData.studentId || '').replace(/\D/g, '');
  // 🐛 ต้องเป็นเลข 11 หลัก "ที่ไม่ติดกับตัวเลขอื่น" เท่านั้น — เดิมใช้ /\d{11}/ เฉยๆ
  // ซึ่งไปหยิบ 11 หลักแรกของ "เลขประจำตัวประชาชน" (13 หลัก) ที่อยู่ติดกันบนบัตรได้
  // ทำให้ได้รหัสนักเรียนมั่วๆ ที่ดูเหมือนถูกต้องแล้วบันทึกตัดคะแนนผิดคน แทนที่จะ
  // ปล่อยว่างให้ครูกรอกเอง (ซึ่งเป็นสิ่งที่ prompt ใน Service_OCR.gs สั่ง AI ให้ทำ
  // เมื่อไม่แน่ใจอยู่แล้ว — ตรงนี้ห้ามทำลายเจตนานั้น)
  // (ไม่ใช้ lookbehind (?<!\d) เพราะ iPhone ที่ iOS ต่ำกว่า 16.4 ไม่รองรับ — regex
  // ผิดรูปแบบตอนโหลดไฟล์จะทำให้ทั้งแอปพังบนเครื่องพวกนั้น ใช้กลุ่มจับแทนแบบเทียบเท่า)
  const idMatch = fullText.match(/(?:^|\D)(\d{11})(?:\D|$)/);
  const cleanStudentId = /^\d{11}$/.test(rawStudentIdDigits)
    ? rawStudentIdDigits
    : (idMatch ? idMatch[1] : '');

  // ระดับชั้น — เชื่อฟิลด์ level ที่ AI แยกมาให้ก่อนเช่นกัน เดิมเช็กจาก fullText
  // ทั้งก้อนแบบไม่มีเงื่อนไข ถ้าเจอทั้ง "ปวช"/"ปวส" ปนกันในข้อความ (เช่น หลุดมา
  // จากฟิลด์อื่น) จะเลือก "ปวส." เสมอเพราะเช็กทับท้ายสุดโดยไม่มีเหตุผลรองรับ
  const rawLevel = String(extractedData.level || '');
  let cleanLevel = '';
  if (isOnlineCard) cleanLevel = '';
  else if (rawLevel.includes('ปวส')) cleanLevel = 'ปวส.';
  else if (rawLevel.includes('ปวช')) cleanLevel = 'ปวช.';
  else if (fullText.includes('ปวส')) cleanLevel = 'ปวส.';
  else if (fullText.includes('ปวช')) cleanLevel = 'ปวช.';

  return {
    studentId: cleanStudentId,
    nameTitle: cleanTitle,
    studentName: cleanName,
    fieldOfStudy: cleanMajor,
    level: cleanLevel,
    cardType: isOnlineCard ? 'online' : 'physical',
  };
}
