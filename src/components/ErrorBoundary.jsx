import React from 'react';

// ตัวรับข้อผิดพลาดตอนเรนเดอร์ — เดิมถ้าหน้าไหนโยน error ระหว่างเรนเดอร์ (เช่น ข้อมูลจาก
// เซิร์ฟเวอร์มีรูปแบบที่หน้านั้นไม่คาดคิด) React จะถอดทั้งแอปออก เหลือหน้าจอขาวเปล่า
// ไม่มีข้อความอะไรเลย ผู้ใช้ไม่รู้ว่าเกิดอะไร ต้องเดาเองว่าให้รีเฟรช — ตอนนี้ขึ้นข้อความ
// และปุ่มโหลดใหม่แทน (ส่วนอื่นของแอปที่ไม่ได้พังยังใช้ได้เหมือนเดิมหลังกดโหลดใหม่)
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('UI render error:', error, info && info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6 text-center font-sans">
        <p className="font-display text-[18px] font-medium text-ink">เกิดข้อผิดพลาดในการแสดงหน้านี้</p>
        <p className="max-w-[360px] text-sm text-ink-mute">
          ข้อมูลของคุณไม่ได้สูญหาย กรุณากดโหลดหน้าใหม่ ถ้ายังเป็นอยู่ให้ออกจากระบบแล้วเข้าใหม่ หรือแจ้งผู้ดูแลระบบ
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-12 rounded-[14px] bg-brand-700 px-6 font-display font-medium text-white hover:bg-brand-800"
        >
          โหลดหน้าใหม่
        </button>
      </div>
    );
  }
}
