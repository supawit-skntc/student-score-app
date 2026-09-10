"""
bot_gui.py — หน้าต่างควบคุมบอทแบบกราฟิก สำหรับเจ้าหน้าที่ที่ไม่ถนัดเขียนโปรแกรม

รวม 2 อย่างที่เดิมต้องทำแยกกันผ่านจอดำ (terminal) ให้อยู่ในหน้าต่างเดียว:
  1. ตั้งค่าบัญชี — แทน setup_credentials.py แบบเดิมที่เป็นคำถามทีละบรรทัดในจอดำ
     (ยังเก็บรหัสผ่านที่เดียวกัน คือ Windows Credential Manager ผ่าน keyring
     เหมือนเดิมทุกอย่าง — เปลี่ยนแค่หน้าตาตอนกรอก ไม่เปลี่ยนที่เก็บ)
  2. ปุ่มกดรันบอท (ทดสอบ/จริง) พร้อมดูผลลัพธ์สดๆ ในกล่องข้อความ แทนการดับเบิลคลิก
     ไฟล์ .bat แล้วเห็นแค่จอดำวิ่งข้อความผ่านไปเฉยๆ

วิธีเปิด: ดับเบิลคลิก control_panel.bat (ไม่ต้องเปิด PowerShell/พิมพ์คำสั่งเอง)

ความปลอดภัย:
- รหัสผ่านเก็บใน Windows Credential Manager (เข้ารหัสโดย Windows เอง) เหมือนเดิม
  ไม่ได้เก็บเป็นไฟล์ข้อความธรรมดาที่เปิดอ่านได้ทันที
- ปุ่ม "รันบอท" แค่เรียก main.py ตัวเดิมที่ผ่านการตรวจสอบแล้วเป็น subprocess ใน
  เครื่องนี้เท่านั้น ไม่ได้เปิดพอร์ต/เว็บเซิร์ฟเวอร์ใดๆ ให้คนนอกเข้าถึงจากอินเทอร์เน็ต
  ได้เลย — ต่างจากการทำปุ่ม "รันบอท" บนหน้าเว็บสาธารณะซึ่งเสี่ยงกว่ามาก
- หน้าต่างนี้ใช้งานได้เฉพาะคนที่นั่งอยู่หน้าเครื่องนี้จริงๆ เท่านั้น

การรันอัตโนมัติเต็มรูปแบบ (เช่น ทุก 15 นาทีตลอดวันโดยไม่ต้องมีคนกดเอง) ยังคงใช้
Windows Task Scheduler ชี้ไปที่ run_bot.bat ตามเดิม (ดู README.md) — หน้าต่างนี้
มีไว้สำหรับตั้งค่าครั้งแรก และกรณีอยากรันเองตอนไหนเป็นพิเศษ
"""

import subprocess
import sys
import threading
import tkinter as tk
from tkinter import messagebox, scrolledtext, ttk

import keyring

SERVICE = "rms-rpa-bot"

FIELDS = [
    ("app_username", "ชื่อผู้ใช้งานเว็บแอป EDMS", False),
    ("app_password", "รหัสผ่านเว็บแอป EDMS", True),
    ("rms_username", "ชื่อผู้ใช้งาน RMS จริง", False),
    ("rms_password", "รหัสผ่าน RMS จริง", True),
]


class BotControlPanel(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("ควบคุมบอท RMS — ระบบตัดคะแนนความประพฤติ")
        self.geometry("640x620")
        self.minsize(560, 520)

        self.entries = {}
        self.process = None

        self._build_credentials_section()
        self._build_run_section()
        self._load_existing_values()

    def _build_credentials_section(self):
        frame = ttk.LabelFrame(self, text="1. ตั้งค่าบัญชี (ทำครั้งเดียว)", padding=12)
        frame.pack(fill="x", padx=12, pady=(12, 6))

        for i, (key, label, is_secret) in enumerate(FIELDS):
            ttk.Label(frame, text=label + ":").grid(row=i, column=0, sticky="w", pady=4)
            var = tk.StringVar()
            entry = ttk.Entry(frame, textvariable=var, width=38, show="*" if is_secret else "")
            entry.grid(row=i, column=1, sticky="we", padx=(8, 0), pady=4)
            self.entries[key] = var

        frame.columnconfigure(1, weight=1)

        hint = ttk.Label(
            frame,
            text="กรอกเฉพาะช่องที่ต้องการเปลี่ยน — ช่องที่เว้นว่างไว้จะไม่ถูกลบค่าเดิม",
            foreground="#666666",
        )
        hint.grid(row=len(FIELDS), column=0, columnspan=2, sticky="w", pady=(6, 0))

        ttk.Button(frame, text="บันทึกการตั้งค่า", command=self._save_credentials).grid(
            row=len(FIELDS) + 1, column=0, columnspan=2, pady=(10, 0), sticky="e"
        )

    def _build_run_section(self):
        frame = ttk.LabelFrame(self, text="2. รันบอท", padding=12)
        frame.pack(fill="both", expand=True, padx=12, pady=6)

        btn_row = ttk.Frame(frame)
        btn_row.pack(fill="x", pady=(0, 8))

        self.dryrun_btn = ttk.Button(
            btn_row, text="ทดสอบ (ไม่บันทึกจริง)", command=lambda: self._run_bot(dry_run=True)
        )
        self.dryrun_btn.pack(side="left", padx=(0, 8))

        self.run_btn = ttk.Button(btn_row, text="รันจริง", command=lambda: self._run_bot(dry_run=False))
        self.run_btn.pack(side="left")

        self.status_label = ttk.Label(btn_row, text="พร้อมทำงาน", foreground="#0B5F48")
        self.status_label.pack(side="left", padx=12)

        self.log_box = scrolledtext.ScrolledText(frame, height=20, state="disabled", font=("Consolas", 9))
        self.log_box.pack(fill="both", expand=True)

    def _load_existing_values(self):
        # โหลดค่าที่เคยตั้งไว้แล้วมาแสดง (แบบ mask ด้วย * เหมือนเดิมสำหรับรหัสผ่าน)
        # เพื่อให้เห็นว่า "มีค่าอยู่แล้วนะ" โดยไม่ต้องเปิดดูรหัสผ่านจริงบนจอ
        for key, var in self.entries.items():
            existing = keyring.get_password(SERVICE, key)
            if existing:
                var.set(existing)

    def _save_credentials(self):
        saved_any = False
        for key, var in self.entries.items():
            value = var.get().strip()
            if value:
                keyring.set_password(SERVICE, key, value)
                saved_any = True
        if saved_any:
            messagebox.showinfo("บันทึกแล้ว", "บันทึกการตั้งค่าบัญชีเรียบร้อยแล้ว")
        else:
            messagebox.showwarning("ไม่มีอะไรให้บันทึก", "กรุณากรอกอย่างน้อย 1 ช่องก่อนบันทึก")

    def _append_log(self, text):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", text)
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def _run_bot(self, dry_run):
        if self.process is not None:
            messagebox.showwarning("กำลังทำงานอยู่", "บอทกำลังทำงานอยู่ กรุณารอให้เสร็จก่อน")
            return

        self.run_btn.configure(state="disabled")
        self.dryrun_btn.configure(state="disabled")
        self.status_label.configure(text="กำลังทำงาน...", foreground="#8A5A0B")
        mode_label = "ทดสอบ (dry run)" if dry_run else "รันจริง"
        self._append_log(f"\n{'=' * 50}\nเริ่ม{mode_label}...\n{'=' * 50}\n")

        args = [sys.executable, "main.py"]
        if dry_run:
            args.append("--dry-run")

        def worker():
            try:
                self.process = subprocess.Popen(
                    args,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                )
                for line in self.process.stdout:
                    self.after(0, self._append_log, line)
                self.process.wait()
            except Exception as e:
                self.after(0, self._append_log, f"\nเกิดข้อผิดพลาด: {e}\n")
            finally:
                self.process = None
                self.after(0, self._on_run_finished)

        threading.Thread(target=worker, daemon=True).start()

    def _on_run_finished(self):
        self.run_btn.configure(state="normal")
        self.dryrun_btn.configure(state="normal")
        self.status_label.configure(text="พร้อมทำงาน", foreground="#0B5F48")
        self._append_log("\n--- เสร็จสิ้น ---\n")


if __name__ == "__main__":
    app = BotControlPanel()
    app.mainloop()
