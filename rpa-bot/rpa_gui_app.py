"""
rpa_gui_app.py — ตัวเข้าโปรแกรม "RMS-Bot.exe" (หน้าต่างควบคุมแบบกราฟิก ไม่มีจอดำ)

เปิดหน้าต่างเดียวกับ bot_gui.py ที่ใช้อยู่เดิม (control_panel.bat) ทุกประการ — ไฟล์นี้
แค่เป็นจุดเริ่มต้นสำหรับห่อเป็น .exe ปุ่มรันในหน้าต่างจะไปเรียก rms-bot-runner.exe
ที่อยู่โฟลเดอร์เดียวกัน (ดู bot_gui.py)
"""

try:  # มีเฉพาะตอนรันเป็น .exe ที่ห่อด้วย PyInstaller (หน้าจอ splash ตอนเปิดโปรแกรม)
    import pyi_splash
except ImportError:
    pyi_splash = None

from bot_gui import BotControlPanel

if __name__ == "__main__":
    app = BotControlPanel()
    app.update()  # ให้หน้าต่างจริงวาดเสร็จก่อนค่อยปิด splash จะได้ไม่มีช่วงว่าง
    if pyi_splash:
        pyi_splash.close()
    app.mainloop()
