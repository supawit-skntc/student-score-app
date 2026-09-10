import React from 'react';
import { Loader2, X, Save } from 'lucide-react';
import { OFFENSES, findOffense } from '../data/offenses';

const inputCls = "min-h-12 w-full rounded-[13px] border-[1.5px] border-[#E3D9DA] bg-field px-3.5 py-3 text-[15px] outline-none transition focus:border-brand-500 focus:bg-white focus:shadow-[0_0_0_4px_rgba(228,187,92,.3)]";
const labelCls = "block text-[13px] font-semibold text-ink-soft mb-1.5";

// หน้าต่างแก้ไขบันทึกการตัดคะแนน — แยกออกมาจาก Report.jsx เพราะเดิมไฟล์เดียว
// ยาวเกินไป (ฟอร์มแก้ไขนี้เป็นก้อน JSX ที่ใหญ่ที่สุดในหน้านั้น) ตรรกะ/state ยังอยู่
// ที่ Report.jsx เหมือนเดิม ที่นี่รับแค่ record + handler ผ่าน props
export default function EditRecordModal({ record, onChange, onSubmit, onClose, isSaving }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/40 backdrop-blur-sm">
      <div className="bg-white rounded-t-[24px] sm:rounded-[22px] shadow-modal w-full max-w-[420px] max-h-[90vh] overflow-y-auto">

        <div className="sticky top-0 z-10 bg-white border-b border-line-soft p-5 flex justify-between items-center">
          <div>
            <h2 className="font-display text-[17px] font-medium text-ink">แก้ไขรายการ</h2>
            <p className="text-[12.5px] text-ink-mute mt-1">รหัสอ้างอิง: {record.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-line-soft text-ink-mute transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5">
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelCls}>วันที่กระทำผิด</label>
              <input type="date" name="date" required value={record.date} onChange={onChange} className={inputCls} />
            </div>

            <div>
              <label className={labelCls}>รหัสนักเรียน</label>
              <input type="text" name="studentId" required value={record.studentId} onChange={onChange} className={inputCls} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className={labelCls}>คำนำหน้า</label>
                <select name="nameTitle" required value={record.nameTitle} onChange={onChange} className={`${inputCls} bg-white`}>
                  <option value="">เลือก</option>
                  <option value="นาย">นาย</option>
                  <option value="นางสาว">นางสาว</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>ชื่อ-นามสกุล</label>
                <input type="text" name="studentName" required value={record.studentName} onChange={onChange} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>สาขาวิชา</label>
              <input type="text" name="fieldOfStudy" required value={record.fieldOfStudy} onChange={onChange} className={inputCls} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>ระดับชั้น</label>
                <select name="level" required value={record.level} onChange={onChange} className={`${inputCls} bg-white`}>
                  <option value="ปวช.">ปวช.</option>
                  <option value="ปวส.">ปวส.</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>ปีที่</label>
                <input type="number" name="year" required min="1" max="3" value={record.year} onChange={onChange} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>ห้อง</label>
                <input type="text" name="room" required value={record.room} onChange={onChange} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>ฐานความผิด</label>
              <select
                name="mainOffense"
                required
                value={record.mainOffense}
                onChange={onChange}
                className={`${inputCls} bg-white`}
              >
                <option value="">-- เลือกความผิด --</option>
                {OFFENSES.map((o) => (
                  <option key={o.label} value={o.label}>
                    {o.label}{o.points != null ? ` (ตัด ${o.points} คะแนน)` : ''}
                  </option>
                ))}
              </select>
              {findOffense(record.mainOffense)?.note && (
                <p className="mt-1.5 rounded-[13px] bg-gold-50 px-3.5 py-2.5 text-xs text-gold-700">⚠ {findOffense(record.mainOffense).note}</p>
              )}
            </div>

            {record.mainOffense === "อื่นๆ" && (
              <div>
                <label className="block text-[13px] font-semibold text-bad-fg mb-1.5">โปรดระบุรายละเอียดความผิด *</label>
                <input
                  type="text"
                  name="otherOffense"
                  required
                  value={record.otherOffense}
                  onChange={onChange}
                  className="min-h-12 w-full rounded-[13px] border-[1.5px] border-[#F0CDD4] bg-[#FFF7F8] px-3.5 py-3 text-[15px] outline-none transition focus:border-bad-fg"
                  placeholder="ตัวอย่าง: นำอาหารเข้ามารับประทานในห้องปฏิบัติการคอมพิวเตอร์"
                />
              </div>
            )}

            <div>
              <label className={labelCls}>หัก (คะแนน)</label>
              <input type="number" name="points" required value={record.points.replace('-', '')} onChange={onChange}
                className="min-h-12 w-full rounded-[13px] border-[1.5px] border-[#F0CDD4] bg-[#FFF7F8] px-3.5 py-3 text-[17px] font-bold text-bad-fg outline-none transition focus:border-bad-fg" />
              {findOffense(record.mainOffense)?.ref && (
                <p className="mt-1.5 text-[11.5px] text-ink-faint">ค่าเริ่มต้นตาม{findOffense(record.mainOffense).ref} — แก้ไขได้หากมีเหตุอันควร</p>
              )}
            </div>
          </div>

          <div className="mt-6 flex gap-3 pt-5 border-t border-line-soft">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[50px] rounded-[15px] border border-line text-ink-soft font-semibold hover:bg-line-soft transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 min-h-[50px] rounded-[15px] bg-gradient-to-b from-brand-600 to-brand-700 text-white font-display font-medium hover:from-brand-500 hover:to-brand-600 flex items-center justify-center gap-2 transition-colors disabled:from-brand-400 disabled:to-brand-400"
            >
              {isSaving ? <Loader2 className="animate-spin" size={19} /> : <Save size={19} />}
              {isSaving ? "กำลังอัปเดตระบบ..." : "บันทึก"}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
