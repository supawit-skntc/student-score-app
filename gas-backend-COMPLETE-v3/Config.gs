const CONFIG = {
  SPREADSHEET_ID: SpreadsheetApp.getActiveSpreadsheet().getId(),
  FOLDER_ID: "1esVLkFHHqkWPSR1c4Z9K-je_3E5WLEF7",
  TEMPLATE_ID: "1O12nW9msC54n5Vk_ngaeMTKvaUNfpFGrWrQ3GoGSsNo",
  // 📧 อีเมลรับการแจ้งเตือนอัตโนมัติเมื่อเซิร์ฟเวอร์เกิดข้อผิดพลาดที่ไม่คาดคิด
  // (ดู notifyAdminOfError_ ใน Service_Ops.gs) — ใส่อีเมลผู้ดูแลระบบที่นี่ เช่น
  // "admin@sktc.ac.th" ถ้าเว้นว่างไว้ ระบบจะไม่ส่งอีเมลแจ้งเตือนใดๆ (ปิดเงียบๆ)
  ADMIN_ALERT_EMAIL: ""
};
