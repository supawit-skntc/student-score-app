import React, { useState, useEffect } from 'react';
import { Camera, Save, Loader2, UserRound, FileWarning } from 'lucide-react';
import Swal from 'sweetalert2';
import { callAPI } from '../services/api';
import { OFFENSES, findOffense } from '../data/offenses';
import { resizeImageForOcr, parseOcrCardData, MAJORS_BY_LEVEL } from '../utils/ocr';
import { todayLocalISO } from '../utils/date';

const TITLE_OPTIONS = ['นาย', 'นาง', 'นางสาว'];

// รหัสสุ่ม 1 ตัวต่อการกรอกฟอร์ม 1 รอบ ใช้กันบันทึกซ้ำฝั่งเซิร์ฟเวอร์ (ดู
// findRecordByClientRequestId_ ใน Service_Records.gs) — เผื่อเบราว์เซอร์เก่า
// มากๆ ไม่มี crypto.randomUUID ก็ยังมีรหัสสำรองที่สุ่มไม่ซ้ำพอใช้งานได้
function generateRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function DeductionForm() {
  const [formData, setFormData] = useState({
    date: todayLocalISO(),
    studentId: '', nameTitle: '', studentName: '', fieldOfStudy: '',
    level: 'ปวช.', year: '1', room: '',
    offense: '', otherOffense: '',
    points: '',
    teacherName: '', // เคลียร์ค่าเริ่มต้นให้ว่างไว้ก่อน
    clientRequestId: generateRequestId(),
  });

  const [isScanning, setIsScanning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      const user = JSON.parse(storedUser);
      // นำชื่อ user.name มายัดใส่ใน teacherName
      setFormData(prev => ({ ...prev, teacherName: user.name }));
    }
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // ใช้กับฟิลด์แบบแตะเลือก (คำนำหน้า/สาขาวิชา) แทนการพิมพ์ — ค่าเลือกได้จากลิสต์
  // คงที่อยู่แล้วทั้งคู่ จึงไม่จำเป็นต้องให้ครูพิมพ์เอง (เร็วกว่าและพิมพ์ผิดไม่ได้)
  const setField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // สาขาวิชาของ ปวช./ปวส. เป็นคนละชุดกัน — พอเปลี่ยนระดับ ต้องเคลียร์สาขาวิชาที่
  // เคยเลือกไว้ทิ้งด้วยเสมอ กันเผลอส่งสาขาของอีกระดับหนึ่งติดไปโดยไม่รู้ตัว (เช่น
  // เลือก "ช่างยนต์" (ปวช.) ไว้ แล้วเปลี่ยนเป็น ปวส. ทั้งที่สาขานี้ไม่มีในระดับนั้น)
  const handleLevelChange = (e) => {
    setFormData((prev) => ({ ...prev, level: e.target.value, fieldOfStudy: '' }));
  };

  const majorOptions = MAJORS_BY_LEVEL[formData.level] || MAJORS_BY_LEVEL['ปวช.'];

  // เลือกฐานความผิดแล้วเติมคะแนนให้อัตโนมัติตามระเบียบข้อ 11 (ยังแก้ไขเองได้
  // เผื่อกรณีที่ระเบียบเปิดช่องให้ใช้ดุลยพินิจ) — "อื่นๆ" ไม่มีคะแนนตายตัวจึงเคลียร์
  // ให้กรอกเอง
  const handleOffenseChange = (value) => {
    const entry = findOffense(value);
    setFormData(prev => ({
      ...prev,
      offense: value,
      points: entry && entry.points != null ? String(entry.points) : (value === 'อื่นๆ' ? '' : prev.points),
    }));
  };

  const selectedOffense = findOffense(formData.offense);

  // --- ย้อนกลับมาใช้ AI Logic เวอร์ชันที่เสถียรที่สุด (อวนลากปลา + มีดสับหมู) ---
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsScanning(true);
    setOcrProgress('กำลังเตรียมไฟล์ภาพ...');

    try {
      const base64Image = await resizeImageForOcr(file);

      setOcrProgress('ส่งภาพให้ AI วิเคราะห์...');

      // เรียกผ่าน GAS backend (action "ocrScan") แทนการยิงตรงไปที่ Typhoon AI จาก
      // browser — เดิมคีย์ API ถูกฝังในโค้ดฝั่งเว็บ (VITE_TYPHOON_API_KEY) ทำให้ทุก
      // คนที่เปิดเว็บเห็นคีย์ได้ผ่าน devtools ตอนนี้คีย์อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
      // (ดู Service_OCR.gs — ต้องตั้งค่า Script Property ชื่อ TYPHOON_API_KEY)
      const ocrResult = await callAPI('ocrScan', { image: base64Image });
      if (ocrResult.status !== 'success') throw new Error(ocrResult.message || 'API Error');

      const resultText = ocrResult.raw || '';
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        setOcrProgress('กำลังจัดระเบียบและล้างข้อมูลขยะ...');
        const extractedData = JSON.parse(jsonMatch[0]);
        const parsed = parseOcrCardData(extractedData);

        setFormData(prev => ({
          ...prev,
          studentId: parsed.studentId || prev.studentId,
          nameTitle: parsed.nameTitle || prev.nameTitle,
          studentName: parsed.studentName || prev.studentName,
          fieldOfStudy: parsed.fieldOfStudy || prev.fieldOfStudy,
          level: parsed.level || prev.level
        }));

        setTimeout(() => setOcrProgress(''), 1500);
      } else {
        setOcrProgress('AI ไม่สามารถอ่านรูปแบบบัตรได้ชัดเจน');
      }

    } catch (error) {
      console.error(error);
      // แสดงข้อความ error จริงแทนข้อความตายตัว — ก่อนหน้านี้ต้องเปิด DevTools
      // console ถึงจะเห็นสาเหตุจริง (เช่น permission ผิด, GAS ยังไม่ได้ตั้งค่าคีย์)
      setOcrProgress(error?.message ? `เกิดข้อผิดพลาด: ${error.message}` : 'เกิดข้อผิดพลาดในการเชื่อมต่อ AI');
    } finally {
      setTimeout(() => setIsScanning(false), 1500);
      e.target.value = '';
    }
  };

 // --- ฟังก์ชันส่งข้อมูลจริงไปบันทึกลง Google Sheets และ Google Drive ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // จัดการข้อความฐานความผิดกรณีเลือก "อื่นๆ"
    let finalOffense = formData.offense;
    if (formData.offense === 'อื่นๆ') {
      finalOffense = `อื่นๆ: ${formData.otherOffense}`;
    }

    const dataToSubmit = {
      ...formData,
      offense: finalOffense
    };

    try {
      // เรียกใช้ callAPI ส่ง action ชื่อ "addRecord" ไปยัง Google Apps Script
      const result = await callAPI('addRecord', { data: dataToSubmit });

      if (result.status === 'success') {
        Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ!',
          text: result.message || 'บันทึกข้อมูลเรียบร้อยแล้ว กำลังจัดทำเอกสาร PDF ต่อในเบื้องหลัง',
          timer: 2000,
          showConfirmButton: false
        });

        // 🚀 สั่งสร้าง PDF ต่อทันทีแบบไม่ต้องรอ (fire-and-forget) — ไม่ await เพราะ
        // ไม่อยากให้ครูต้องรอขั้นตอนที่ช้าที่สุดของระบบก่อนจะกรอกรายการถัดไปได้
        // ถ้าคำขอนี้ล้มเหลว/หายกลางทาง ไม่ต้องแจ้งเตือนอะไรครู เพราะข้อมูลนักเรียน
        // บันทึกไปแล้วอย่างปลอดภัยตั้งแต่ addRecord สำเร็จ และมี trigger เบื้องหลัง
        // (processPendingPdfs_ ใน Service_PDF.gs) คอยสร้างซ้ำให้อัตโนมัติทุก 1 นาที
        // — เปิดหน้ารายงานอีกครั้งก็จะเห็นลิงก์ PDF เอง
        if (result.id) {
          callAPI('generateRecordPdf', { id: result.id }).catch((err) => {
            console.error('generateRecordPdf (background) error:', err);
          });
        }

        // เคลียร์ค่าในฟอร์มหลังบันทึกสำเร็จ — สุ่ม clientRequestId ใหม่ให้รายการ
        // ถัดไปด้วย (ถ้าไม่สำเร็จ จะ "ไม่" สุ่มใหม่ เพื่อให้กดบันทึกซ้ำด้วยรหัส
        // เดิมได้อย่างปลอดภัย เผื่อจริงๆ แล้วรอบก่อนหน้าบันทึกสำเร็จไปแล้วแต่
        // คำตอบหายกลางทาง — ดู findRecordByClientRequestId_ ฝั่งเซิร์ฟเวอร์)
        setFormData(prev => ({
          ...prev,
          studentId: '', nameTitle: '', studentName: '', fieldOfStudy: '',
          room: '', offense: '', otherOffense: '', points: '',
          clientRequestId: generateRequestId(),
        }));
      } else {
        Swal.fire({
          icon: 'error',
          title: 'บันทึกไม่สำเร็จ',
          text: result.message || 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์'
        });
      }
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error?.message || 'ไม่สามารถเชื่อมต่อกับ Google Apps Script ได้'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ฟอนต์ input ต้อง >= 16px เสมอ — ต่ำกว่านี้ iOS Safari จะซูมจอเข้าอัตโนมัติทุก
  // ครั้งที่แตะโฟกัสช่องกรอก (มือถือ) ทำให้รู้สึกว่า UI ไม่พอดีกับจอ
  const inputCls = "min-h-12 w-full rounded-[13px] border-[1.5px] border-[#E3D9DA] bg-field px-3.5 py-3 text-[16px] outline-none transition focus:border-brand-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(228,187,92,.3)]";
  const labelCls = "mb-1.5 block text-[13px] font-semibold text-ink-soft";

  return (
    <div className="mx-auto max-w-[760px] flex flex-col gap-4">

      {/* --- AI scan hero --- */}
      <label className="relative block overflow-hidden rounded-[20px] border-2 border-dashed border-brand-200 bg-[#FDF4F5] p-5 text-center transition-colors hover:bg-brand-50 hover:border-brand-400 cursor-pointer">
        {isScanning ? (
          <div className="flex flex-col items-center justify-center text-brand-700 py-3">
            <Loader2 className="mb-3 h-9 w-9 animate-spin" />
            <span className="text-sm font-semibold">{ocrProgress}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3.5 flex-wrap">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            />
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white">
              <Camera size={24} />
            </span>
            <span className="text-left">
              <span className="block font-display text-[15.5px] font-medium text-brand-800">ถ่ายรูป / อัปโหลดบัตรนักเรียน</span>
              {/* คำแนะนำเรื่องการถ่ายภาพ — ช่วยความแม่นยำของ AI ได้มากกว่าการปรับ
                  ค่า resize/quality ในโค้ดเสียอีก (ดู resizeImageForOcr ใน ocr.js) */}
              <span className="block mt-0.5 text-[12.5px] text-[#8A5A66]">{ocrProgress || 'ถ่ายให้บัตรเต็มเฟรม แสงสว่างพอ ไม่เอียง — AI จะกรอกรหัส ชื่อ และสาขาวิชาให้อัตโนมัติ'}</span>
            </span>
          </div>
        )}
      </label>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* --- Section: student info --- */}
        <div className="rounded-[20px] bg-white p-[18px] border border-line">
          <div className="mb-4 flex items-center gap-2.5 pb-3.5 border-b border-line-soft">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-brand-50 text-brand-700">
              <UserRound size={17} strokeWidth={2.25} />
            </div>
            <h2 className="font-display text-[15px] font-medium text-ink">ข้อมูลนักเรียน</h2>
          </div>

          <div className="flex flex-col gap-3.5">
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <div>
                <label className={labelCls}>รหัสประจำตัวนักเรียน</label>
                <input type="text" name="studentId" value={formData.studentId} onChange={handleChange} required placeholder="เช่น 67301001" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>ชื่อ-นามสกุล</label>
                <input type="text" name="studentName" value={formData.studentName} onChange={handleChange} required className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>คำนำหน้า</label>
              <div className="flex flex-wrap gap-2">
                {TITLE_OPTIONS.map((t) => {
                  const active = formData.nameTitle === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setField('nameTitle', t)}
                      className={`min-h-11 rounded-[14px] px-4 text-[13.5px] font-semibold border-[1.5px] transition-colors
                        ${active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-[#EADFDF] bg-white text-ink-soft hover:bg-line-soft'}`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>ระดับ</label>
                <select name="level" value={formData.level} onChange={handleLevelChange} className={`${inputCls} bg-white`}>
                  <option value="ปวช.">ปวช.</option>
                  <option value="ปวส.">ปวส.</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>ปีที่</label>
                <select name="year" value={formData.year} onChange={handleChange} className={`${inputCls} bg-white`}>
                  <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>ห้อง</label>
                <input type="text" name="room" value={formData.room} onChange={handleChange} required className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>สาขาวิชา ({formData.level})</label>
              <div className="flex flex-wrap gap-2">
                {majorOptions.map((m) => {
                  const active = formData.fieldOfStudy === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setField('fieldOfStudy', m)}
                      className={`min-h-11 rounded-[14px] px-3.5 text-[13.5px] font-semibold border-[1.5px] transition-colors
                        ${active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-[#EADFDF] bg-white text-ink-soft hover:bg-line-soft'}`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* --- Section: offense details --- */}
        <div className="rounded-[20px] bg-white p-[18px] border border-line">
          <div className="mb-4 flex items-center gap-2.5 pb-3.5 border-b border-line-soft">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px] bg-bad-bg text-bad-fg">
              <FileWarning size={17} strokeWidth={2.25} />
            </div>
            <h2 className="font-display text-[15px] font-medium text-ink">รายละเอียดความผิด</h2>
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <label className={labelCls}>ฐานความผิด</label>
              <div className="flex flex-wrap gap-2">
                {OFFENSES.map((o) => {
                  const active = formData.offense === o.label;
                  return (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => handleOffenseChange(o.label)}
                      className={`inline-flex items-center gap-1.5 min-h-11 rounded-[14px] px-3.5 text-[13.5px] font-semibold border-[1.5px] transition-colors
                        ${active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-[#EADFDF] bg-white text-ink-soft hover:bg-line-soft'}`}
                    >
                      {o.label}
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11.5px] font-bold ${active ? 'bg-brand-600 text-white' : 'bg-line-soft text-ink-mute'}`}>
                        {o.points != null ? `-${o.points}` : 'ระบุเอง'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedOffense?.note && (
                <p className="mt-2.5 rounded-[13px] bg-gold-50 px-3.5 py-2.5 text-[12.5px] text-gold-700">⚠ {selectedOffense.note}</p>
              )}
            </div>

            {formData.offense === 'อื่นๆ' && (
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
                  โปรดระบุรายละเอียดความผิด <span className="text-bad-fg">*</span>
                </label>
                <input
                  type="text"
                  name="otherOffense"
                  value={formData.otherOffense}
                  onChange={handleChange}
                  required
                  className="min-h-12 w-full rounded-[13px] border-[1.5px] border-[#F0CDD4] bg-[#FFF7F8] px-3.5 py-3 text-[16px] outline-none transition focus:border-bad-fg focus:shadow-[0_0_0_4px_rgba(228,187,92,.3)]"
                  placeholder="ตัวอย่าง: นำอาหารเข้ามารับประทานในห้องปฏิบัติการคอมพิวเตอร์"
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <div>
                <label className={labelCls}>ตัดคะแนน</label>
                <input type="number" name="points" min="1" value={formData.points} onChange={handleChange} required
                  className="min-h-12 w-full rounded-[13px] border-[1.5px] border-[#F0CDD4] bg-[#FFF7F8] px-3.5 py-3 text-[17px] font-bold text-bad-fg outline-none transition focus:border-bad-fg" />
                {selectedOffense?.ref && (
                  <p className="mt-1.5 text-[11.5px] text-ink-faint">ค่าเริ่มต้นตาม{selectedOffense.ref} — แก้ไขได้หากมีเหตุอันควร</p>
                )}
              </div>
              <div>
                <label className={labelCls}>วันที่กระทำผิด</label>
                <input type="date" name="date" value={formData.date} onChange={handleChange} required className={inputCls} />
              </div>
            </div>
          </div>
        </div>

        {/* --- Submit bar: sticky full-bleed on mobile, inline card on desktop --- */}
        <div className="flex items-center justify-end gap-3 sticky bottom-0 -mx-4 -mb-4 px-4 py-3 bg-white/[0.97] backdrop-blur-sm border-t border-line
          md:static md:mx-0 md:mb-0 md:justify-between md:rounded-[20px] md:border md:px-[18px] md:py-3.5 md:bg-white md:backdrop-blur-0">
          <span className="hidden md:block text-[12.5px] text-ink-mute">ผู้บันทึก: {formData.teacherName}</span>
          <button type="submit" disabled={isSubmitting}
            className={`flex min-h-[52px] items-center justify-center gap-2 rounded-[15px] px-7 font-display font-medium text-white shadow-[0_10px_22px_-12px_rgba(92,29,44,.9)] transition
              ${isSubmitting ? 'cursor-not-allowed bg-brand-400' : 'bg-gradient-to-b from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600'}`}>
            {isSubmitting ? <Loader2 className="animate-spin" size={19} /> : <Save size={19} />}
            {isSubmitting ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
          </button>
        </div>

      </form>
    </div>
  );
}
