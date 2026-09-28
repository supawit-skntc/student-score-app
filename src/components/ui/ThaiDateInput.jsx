import { useRef } from 'react';

// input[type=date]'s displayed format follows the OS/browser locale (often
// mm/dd/yyyy), which HTML alone can't override reliably across browsers.
// So we keep the native input for its picker/keyboard support but make it
// invisible, and render our own always-dd/mm/yyyy text on top of it.
function toDMY(iso) {
  const parts = String(iso || '').split('-');
  if (parts.length !== 3) return '';
  const [y, m, d] = parts;
  if (!y || !m || !d) return '';
  return `${d}/${m}/${y}`;
}

function CalendarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export default function ThaiDateInput({
  value,
  onChange,
  name,
  required,
  boxClassName = 'min-h-12 w-full rounded-[13px] border-[1.5px] border-[#E3D9DA] bg-field px-3.5 py-3 text-[16px] transition group-focus-within:border-brand-500 group-focus-within:bg-white group-focus-within:shadow-[0_0_0_4px_rgba(228,187,92,.3)]',
  wrapperClassName = '',
  placeholder = 'วว/ดด/ปปปป',
  ariaLabel,
}) {
  const inputRef = useRef(null);
  const display = toDMY(value);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
      } catch {
        // some browsers refuse showPicker() outside a direct user gesture; focus() already ran above
      }
    }
  };

  return (
    <div className={`group relative ${wrapperClassName}`}>
      <div onClick={openPicker} className={`flex cursor-pointer items-center justify-between ${boxClassName}`}>
        <span className={display ? '' : 'text-ink-faint'}>{display || placeholder}</span>
        <CalendarIcon className="h-4 w-4 shrink-0 text-ink-faint" />
      </div>
      {/* pointer-events-none: เดิมช่อง input นี้ (absolute, ไม่มี z-index) วางทับกล่องแสดงผลด้านบนอยู่แล้ว
          ตามกฎ stacking ของ CSS (positioned element ลอยเหนือ static element เสมอไม่ว่าลำดับ DOM จะเป็นยังไง)
          ทำให้คลิกทุกครั้งไปโดนช่อง input นี้ตรงๆ อยู่แล้วโดยไม่เคยผ่าน onClick ของกล่องด้านบนเลยสักครั้ง —
          ปิดรับ pointer event ที่นี่ ให้คลิกทั้งหมดทะลุไปโดน onClick={openPicker} ของกล่องแทน (เรียก
          showPicker() เอง เชื่อถือได้กว่าพฤติกรรมเปิด picker อัตโนมัติของเบราว์เซอร์ที่ต่างกันไปแต่ละที่)
          ยังกด Tab มาโฟกัสช่องนี้ได้ตามปกติ (คีย์บอร์ดไม่ถูก pointer-events บล็อก) */}
      <input
        ref={inputRef}
        type="date"
        name={name}
        value={value || ''}
        onChange={onChange}
        required={required}
        aria-label={ariaLabel || placeholder}
        className="absolute inset-0 h-full w-full pointer-events-none opacity-0"
      />
    </div>
  );
}
