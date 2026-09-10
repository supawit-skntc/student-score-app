"""
bot_gui.py — หน้าต่างควบคุมบอทแบบกราฟิก สำหรับเจ้าหน้าที่ที่ไม่ถนัดเขียนโปรแกรม

ดีไซน์อ้างอิงจาก "UI โปรแกรมสมัยใหม่/RMS Bot Control.dc.html" +
"UI โปรแกรมสมัยใหม่/HANDOFF.md" — ใช้ CustomTkinter แทน tkinter.ttk เดิม

รวม 2 อย่างที่เดิมต้องทำแยกกันผ่านจอดำ (terminal) ให้อยู่ในหน้าต่างเดียว:
  1. ตั้งค่าบัญชี — แทน setup_credentials.py แบบเดิมที่เป็นคำถามทีละบรรทัดในจอดำ
     (ยังเก็บรหัสผ่านที่เดียวกัน คือ Windows Credential Manager ผ่าน keyring
     เหมือนเดิมทุกอย่าง — เปลี่ยนแค่หน้าตาตอนกรอก ไม่เปลี่ยนที่เก็บ)
  2. ปุ่มกดรันบอท (ทดสอบ/จริง) พร้อมดูผลลัพธ์สดๆ ในคอนโซลล็อก แทนการดับเบิลคลิก
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

import datetime
import os
import re
import subprocess
import sys
import threading
import tkinter.font as tkfont
from tkinter import messagebox, filedialog

import customtkinter as ctk
import keyring

SERVICE = "rms-rpa-bot"

FIELDS = [
    ("app_username", "ชื่อผู้ใช้งาน", False),
    ("app_password", "รหัสผ่าน", True),
    ("rms_username", "ชื่อผู้ใช้งาน", False),
    ("rms_password", "รหัสผ่าน", True),
]

# โทเคนสีตาม design/HANDOFF.md — คงชื่อ/ค่าให้ตรงเป๊ะกับดีไซน์อ้างอิง
COLORS = {
    "bg": "#eceae8",
    "surface": "#ffffff",
    "surface_muted": "#faf7f5",
    "border": "#eae5e2",
    "border_soft": "#f2eeeb",
    "text": "#1c1917",
    "text_muted": "#78716c",
    "text_faint": "#a8a29e",
    "accent": "#7c2438",
    "accent_hover": "#65182b",
    "success": "#0f7a55",
    "success_bg": "#eef7f2",
    "success_border": "#d6ebe0",
    "warning": "#8a6414",
    "warning_dot": "#d99a1f",
    "warning_bg": "#fdf6e9",
    "warning_border": "#f2e3c3",
    "segment_track": "#f4f1ef",
    "console_bg": "#191619",
    "console_text": "#c9c3d0",
    "console_time": "#6b6470",
    "console_success": "#7fd1a8",
    "console_warning": "#e8b04b",
    "console_empty": "#5c5661",
}

ctk.set_appearance_mode("light")
ctk.set_default_color_theme("blue")  # แค่ base theme — สีจริงกำหนดเองทั้งหมดผ่าน COLORS ด้านบน


class BotControlPanel(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("ควบคุมบอท RMS — ระบบตัดคะแนนความประพฤติ")
        self.geometry("1120x780")
        self.minsize(980, 680)
        self.configure(fg_color=COLORS["bg"])

        self.entries = {}
        self.password_vis = {}
        self.password_entries = {}
        self.process = None
        self.is_running = False
        self.current_mode = "test"
        self.done_count = 0
        self.total_count = 0
        self._has_real_log = False

        self._setup_fonts()

        # การ์ดใหญ่ครอบทุกอย่างไว้กลางจอ (เหมือน "หน้าต่างแอป" ในดีไซน์ต้นแบบ)
        self.shell = ctk.CTkFrame(
            self, fg_color=COLORS["surface"], corner_radius=16,
            border_width=1, border_color=COLORS["border"],
        )
        self.shell.pack(fill="both", expand=True, padx=24, pady=24)

        self._build_header()
        self._build_body()
        self._load_existing_values()

    # ตัวอักษรเดิมของ Tk เล็กและอ่านยากมากบนจอความละเอียดสูง — เช็กก่อนว่าเครื่องนี้
    # มีฟอนต์ตามดีไซน์ (IBM Plex Sans Thai / IBM Plex Mono) ติดตั้งไว้ไหม ถ้าไม่มีก็
    # ใช้ฟอนต์สำรองที่ยังอ่านง่ายแทน แทนที่จะปล่อยให้ Tk เลือกฟอนต์เริ่มต้นที่เล็กมาก
    def _setup_fonts(self):
        available = set(tkfont.families(self))
        thai_family = "IBM Plex Sans Thai" if "IBM Plex Sans Thai" in available else "Segoe UI"
        mono_family = "IBM Plex Mono" if "IBM Plex Mono" in available else "Consolas"

        self.font_header = ctk.CTkFont(family=thai_family, size=20, weight="bold")
        self.font_subtitle = ctk.CTkFont(family=thai_family, size=13)
        self.font_card_title = ctk.CTkFont(family=thai_family, size=15, weight="bold")
        self.font_eyebrow = ctk.CTkFont(family=thai_family, size=11, weight="bold")
        self.font_label = ctk.CTkFont(family=thai_family, size=12)
        self.font_input = ctk.CTkFont(family=thai_family, size=14)
        self.font_button = ctk.CTkFont(family=thai_family, size=14, weight="bold")
        self.font_small_button = ctk.CTkFont(family=thai_family, size=12)
        self.font_hint = ctk.CTkFont(family=thai_family, size=12)
        self.font_status = ctk.CTkFont(family=thai_family, size=13)
        self.font_mono = ctk.CTkFont(family=mono_family, size=12)

    def _build_header(self):
        header = ctk.CTkFrame(self.shell, fg_color="transparent")
        header.pack(fill="x", padx=32, pady=(26, 18))

        left = ctk.CTkFrame(header, fg_color="transparent")
        left.pack(side="left")

        logo = ctk.CTkFrame(left, width=42, height=42, corner_radius=12, fg_color=COLORS["accent"])
        logo.pack(side="left")
        logo.pack_propagate(False)
        ctk.CTkLabel(logo, text="R", text_color="white", font=self.font_card_title).place(
            relx=0.5, rely=0.5, anchor="center"
        )

        text_col = ctk.CTkFrame(left, fg_color="transparent")
        text_col.pack(side="left", padx=(14, 0))
        ctk.CTkLabel(
            text_col, text="ระบบตัดคะแนนความประพฤติ", font=self.font_header,
            text_color=COLORS["text"], anchor="w",
        ).pack(anchor="w")
        ctk.CTkLabel(
            text_col, text="เชื่อมต่อ EDMS และ RMS อัตโนมัติ", font=self.font_subtitle,
            text_color=COLORS["text_muted"], anchor="w",
        ).pack(anchor="w")

        self.status_pill = ctk.CTkFrame(
            header, corner_radius=999, fg_color=COLORS["success_bg"],
            border_width=1, border_color=COLORS["success_border"],
        )
        self.status_pill.pack(side="right")
        self.status_dot = ctk.CTkFrame(
            self.status_pill, width=8, height=8, corner_radius=999, fg_color=COLORS["success"]
        )
        self.status_dot.pack(side="left", padx=(14, 8), pady=8)
        self.status_label = ctk.CTkLabel(
            self.status_pill, text="พร้อมทำงาน", font=self.font_status, text_color=COLORS["success"]
        )
        self.status_label.pack(side="left", padx=(0, 14), pady=8)

    def _build_body(self):
        body = ctk.CTkFrame(self.shell, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=32, pady=(0, 28))
        body.grid_columnconfigure(0, weight=105, uniform="col")
        body.grid_columnconfigure(1, weight=100, uniform="col")
        body.grid_rowconfigure(0, weight=1)

        # คอลัมน์ซ้าย — ขั้นตอนที่ 1 ตั้งค่าบัญชี (เติมเนื้อหาในส่วนถัดไป)
        self.settings_card = ctk.CTkFrame(
            body, fg_color=COLORS["surface"], corner_radius=14,
            border_width=1, border_color=COLORS["border"],
        )
        self.settings_card.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        self._build_settings_card()

        # คอลัมน์ขวา — ขั้นตอนที่ 2 รันบอท + คอนโซลล็อก (เติมเนื้อหาในส่วนถัดไป)
        right_col = ctk.CTkFrame(body, fg_color="transparent")
        right_col.grid(row=0, column=1, sticky="nsew", padx=(12, 0))

        self.run_card = ctk.CTkFrame(
            right_col, fg_color=COLORS["surface"], corner_radius=14,
            border_width=1, border_color=COLORS["border"],
        )
        self.run_card.pack(fill="x", pady=(0, 16))

        self.console_card = ctk.CTkFrame(
            right_col, fg_color=COLORS["surface"], corner_radius=14,
            border_width=1, border_color=COLORS["border"],
        )
        self.console_card.pack(fill="both", expand=True)
        self._build_run_card()
        self._build_console_card()

    # ==========================================================
    # ขั้นตอนที่ 2 — แผงรันบอท (บนคอลัมน์ขวา)
    # ==========================================================
    def _build_run_card(self):
        card = self.run_card

        head = ctk.CTkFrame(card, fg_color="transparent")
        head.pack(fill="x", padx=20, pady=(18, 14))
        ctk.CTkFrame(card, height=1, fg_color=COLORS["border_soft"]).place(
            in_=head, relx=0, rely=1.0, relwidth=1.0, y=14
        )
        ctk.CTkLabel(
            head, text="ขั้นตอนที่ 2", font=self.font_eyebrow, text_color=COLORS["text_faint"]
        ).pack(side="left")
        ctk.CTkLabel(
            head, text="รันบอท", font=self.font_card_title, text_color=COLORS["text"]
        ).pack(side="left", padx=(10, 0))

        body = ctk.CTkFrame(card, fg_color="transparent")
        body.pack(fill="x", padx=20, pady=(6, 20))

        ctk.CTkLabel(
            body, text="โหมดการทำงาน", font=self.font_label, text_color=COLORS["text_muted"], anchor="w"
        ).pack(fill="x", pady=(0, 8))

        segment = ctk.CTkFrame(body, fg_color=COLORS["segment_track"], corner_radius=12)
        segment.pack(fill="x")
        segment.grid_columnconfigure(0, weight=1)
        segment.grid_columnconfigure(1, weight=1)

        # ปุ่มทั้งสองยังผูกกับ _run_bot(dry_run=...) ตรงๆ เหมือนโค้ดเดิมทุกประการ —
        # แค่จัดวางให้หน้าตาเหมือนแถบสลับโหมด (segmented control) ตามดีไซน์ ไม่ได้
        # เปลี่ยนพฤติกรรมเป็น "เลือกโหมดก่อนแล้วค่อยกดรันแยก" แต่อย่างใด
        self.test_btn = ctk.CTkButton(
            segment, text="ทดสอบ · ไม่บันทึกจริง", font=self.font_small_button, height=40,
            corner_radius=9, command=lambda: self._run_bot(dry_run=True),
        )
        self.test_btn.grid(row=0, column=0, sticky="nsew", padx=4, pady=4)

        self.real_btn = ctk.CTkButton(
            segment, text="รันจริง", font=self.font_small_button, height=40,
            corner_radius=9, command=lambda: self._run_bot(dry_run=False),
        )
        self.real_btn.grid(row=0, column=1, sticky="nsew", padx=4, pady=4)

        self.mode_note_label = ctk.CTkLabel(
            body, text="", font=self.font_hint, anchor="w", justify="left", wraplength=380,
        )
        self.mode_note_label.pack(fill="x", pady=(8, 16))

        progress_head = ctk.CTkFrame(body, fg_color="transparent")
        progress_head.pack(fill="x", pady=(0, 8))
        self.progress_label = ctk.CTkLabel(
            progress_head, text="ความคืบหน้า", font=self.font_hint, text_color=COLORS["text_muted"]
        )
        self.progress_label.pack(side="left")
        self.progress_count_label = ctk.CTkLabel(
            progress_head, text="0 / 0 (0%)", font=self.font_hint, text_color="#57534e"
        )
        self.progress_count_label.pack(side="right")

        self.progress_bar = ctk.CTkProgressBar(
            body, height=6, corner_radius=999, progress_color=COLORS["accent"],
            fg_color="#f0ecea",
        )
        self.progress_bar.set(0)
        self.progress_bar.pack(fill="x")

        self._update_mode_visual("test")

    def _update_mode_visual(self, mode):
        self.current_mode = mode
        is_real = mode == "real"

        self.test_btn.configure(
            fg_color=("transparent" if is_real else COLORS["surface"]),
            text_color=(COLORS["text_muted"] if is_real else COLORS["text"]),
            hover_color=(COLORS["segment_track"] if is_real else COLORS["surface"]),
        )
        self.real_btn.configure(
            fg_color=(COLORS["surface"] if is_real else "transparent"),
            text_color=(COLORS["accent"] if is_real else COLORS["text_muted"]),
            hover_color=(COLORS["surface"] if is_real else COLORS["segment_track"]),
        )

        if is_real:
            self.mode_note_label.configure(
                text="โหมดนี้จะบันทึกคะแนนลงระบบ RMS จริง ตรวจสอบข้อมูลก่อนเริ่ม",
                text_color="#9a4b1f",
            )
        else:
            self.mode_note_label.configure(
                text="รันผ่านทั้งกระบวนการโดยไม่บันทึกข้อมูลลงระบบจริง",
                text_color=COLORS["text_faint"],
            )

    def _set_status(self, running, mode):
        if running:
            label = "กำลังรันจริง" if mode == "real" else "กำลังทดสอบ"
            self.status_pill.configure(fg_color=COLORS["warning_bg"], border_color=COLORS["warning_border"])
            self.status_dot.configure(fg_color=COLORS["warning_dot"])
            self.status_label.configure(text=label, text_color=COLORS["warning"])
        else:
            self.status_pill.configure(fg_color=COLORS["success_bg"], border_color=COLORS["success_border"])
            self.status_dot.configure(fg_color=COLORS["success"])
            self.status_label.configure(text="พร้อมทำงาน", text_color=COLORS["success"])

    # ==========================================================
    # ขั้นตอนที่ 1 — ฟอร์มตั้งค่าบัญชี (คอลัมน์ซ้าย)
    # ==========================================================
    def _build_settings_card(self):
        card = self.settings_card

        head = ctk.CTkFrame(card, fg_color="transparent")
        head.pack(fill="x", padx=20, pady=(18, 14))
        bottom_line = ctk.CTkFrame(card, height=1, fg_color=COLORS["border_soft"])
        bottom_line.place(in_=head, relx=0, rely=1.0, relwidth=1.0, y=14)

        ctk.CTkLabel(
            head, text="ขั้นตอนที่ 1", font=self.font_eyebrow, text_color=COLORS["text_faint"]
        ).pack(side="left")
        ctk.CTkLabel(
            head, text="ตั้งค่าบัญชี", font=self.font_card_title, text_color=COLORS["text"]
        ).pack(side="left", padx=(10, 0))
        ctk.CTkLabel(
            head, text="ทำครั้งเดียว", font=self.font_hint, text_color=COLORS["text_faint"]
        ).pack(side="right")

        body = ctk.CTkFrame(card, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=20, pady=(6, 20))

        self._build_field_group(body, "เว็บแอป EDMS", FIELDS[0], FIELDS[1])
        ctk.CTkFrame(body, height=1, fg_color=COLORS["border_soft"]).pack(fill="x", pady=16)
        self._build_field_group(body, "บัญชี RMS จริง", FIELDS[2], FIELDS[3])

        hint = ctk.CTkFrame(body, fg_color=COLORS["surface_muted"], corner_radius=10)
        hint.pack(fill="x", pady=(20, 16))
        dot = ctk.CTkFrame(
            hint, width=16, height=16, corner_radius=999, fg_color="transparent",
            border_width=1, border_color=COLORS["text_faint"],
        )
        dot.pack(side="left", padx=(13, 10), pady=11)
        dot.pack_propagate(False)
        ctk.CTkLabel(dot, text="i", font=self.font_hint, text_color=COLORS["text_muted"]).place(
            relx=0.5, rely=0.5, anchor="center"
        )
        ctk.CTkLabel(
            hint, text="กรอกเฉพาะช่องที่ต้องการเปลี่ยน ช่องที่เว้นว่างจะไม่ถูกลบค่าเดิม",
            font=self.font_hint, text_color=COLORS["text_muted"], anchor="w", justify="left",
            wraplength=320,
        ).pack(side="left", fill="x", expand=True, padx=(0, 13), pady=11)

        save_row = ctk.CTkFrame(body, fg_color="transparent")
        save_row.pack(fill="x")
        self.saved_note_label = ctk.CTkLabel(
            save_row, text="ยังไม่ได้บันทึกการเปลี่ยนแปลง", font=self.font_hint,
            text_color=COLORS["text_faint"],
        )
        self.saved_note_label.pack(side="left")
        ctk.CTkButton(
            save_row, text="บันทึกการตั้งค่า", command=self._save_credentials,
            font=self.font_button, height=42, corner_radius=10,
            fg_color=COLORS["accent"], hover_color=COLORS["accent_hover"],
        ).pack(side="right")

    def _build_field_group(self, parent, group_label, username_field, password_field):
        group = ctk.CTkFrame(parent, fg_color="transparent")
        group.pack(fill="x")

        label_row = ctk.CTkFrame(group, fg_color="transparent")
        label_row.pack(fill="x", pady=(0, 12))
        ctk.CTkFrame(
            label_row, width=6, height=6, corner_radius=999, fg_color="#c8b8bd"
        ).pack(side="left", padx=(0, 8))
        ctk.CTkLabel(
            label_row, text=group_label, font=self.font_eyebrow, text_color="#57534e"
        ).pack(side="left")

        key, label, _ = username_field
        self._build_entry_row(group, key, label, is_secret=False)

        key, label, _ = password_field
        self._build_entry_row(group, key, label, is_secret=True)

    def _build_entry_row(self, parent, key, label, is_secret):
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", pady=(0, 12))

        ctk.CTkLabel(
            row, text=label, font=self.font_label, text_color=COLORS["text_muted"], anchor="w"
        ).pack(fill="x", pady=(0, 6))

        field_wrap = ctk.CTkFrame(row, fg_color="transparent", height=42)
        field_wrap.pack(fill="x")
        field_wrap.pack_propagate(False)

        var = ctk.StringVar()
        entry = ctk.CTkEntry(
            field_wrap, textvariable=var, font=self.font_input, height=42, corner_radius=10,
            fg_color=COLORS["surface_muted"], border_color=COLORS["border"], border_width=1,
            text_color=COLORS["text"], show="*" if is_secret else "",
        )
        entry.place(relx=0, rely=0, relwidth=1, relheight=1)
        self.entries[key] = var

        if is_secret:
            self.password_entries[key] = entry
            self.password_vis[key] = False
            toggle = ctk.CTkButton(
                field_wrap, text="แสดง", width=52, height=30, corner_radius=8,
                font=self.font_small_button, fg_color=COLORS["segment_track"],
                hover_color=COLORS["border"], text_color=COLORS["accent"],
                command=lambda k=key: self._toggle_password(k),
            )
            toggle.place(relx=1.0, rely=0.5, anchor="e", x=-6)
            self.password_vis[key] = toggle  # เก็บปุ่มไว้เพื่อเปลี่ยนข้อความ "แสดง"/"ซ่อน" ทีหลัง

    def _toggle_password(self, key):
        entry = self.password_entries[key]
        toggle = self.password_vis[key]
        showing_now = entry.cget("show") == ""
        if showing_now:
            entry.configure(show="*")
            toggle.configure(text="แสดง")
        else:
            entry.configure(show="")
            toggle.configure(text="ซ่อน")

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
            self.saved_note_label.configure(text="บันทึกล่าสุดเมื่อสักครู่")
            messagebox.showinfo("บันทึกแล้ว", "บันทึกการตั้งค่าบัญชีเรียบร้อยแล้ว")
        else:
            messagebox.showwarning("ไม่มีอะไรให้บันทึก", "กรุณากรอกอย่างน้อย 1 ช่องก่อนบันทึก")

    # ==========================================================
    # คอนโซลล็อก (ล่างคอลัมน์ขวา)
    # ==========================================================
    def _build_console_card(self):
        card = self.console_card

        head = ctk.CTkFrame(card, fg_color="transparent")
        head.pack(fill="x", padx=16, pady=(13, 12))
        ctk.CTkFrame(card, height=1, fg_color=COLORS["border_soft"]).place(
            in_=head, relx=0, rely=1.0, relwidth=1.0, y=12
        )
        ctk.CTkLabel(
            head, text="บันทึกการทำงาน", font=self.font_card_title, text_color=COLORS["text"]
        ).pack(side="left")

        btn_row = ctk.CTkFrame(head, fg_color="transparent")
        btn_row.pack(side="right")
        ctk.CTkButton(
            btn_row, text="บันทึกไฟล์", font=self.font_small_button, height=30, width=84,
            corner_radius=8, fg_color=COLORS["surface"], hover_color=COLORS["surface_muted"],
            text_color=COLORS["text_muted"], border_width=1, border_color=COLORS["border"],
            command=self._save_log_to_file,
        ).pack(side="right", padx=(8, 0))
        ctk.CTkButton(
            btn_row, text="ล้าง", font=self.font_small_button, height=30, width=64,
            corner_radius=8, fg_color=COLORS["surface"], hover_color=COLORS["surface_muted"],
            text_color=COLORS["text_muted"], border_width=1, border_color=COLORS["border"],
            command=self._clear_log,
        ).pack(side="right")

        self.log_box = ctk.CTkTextbox(
            card, fg_color=COLORS["console_bg"], text_color=COLORS["console_text"],
            font=self.font_mono, corner_radius=0, wrap="word", height=236,
        )
        self.log_box.pack(fill="both", expand=True, padx=0, pady=(0, 0))
        self.log_box.configure(state="disabled")

        # แท็กสีสำหรับแยกระดับข้อความในล็อก — ต้องตั้งผ่าน tk.Text ตัวจริงที่
        # CTkTextbox ห่ออยู่ข้างใน (attribute `_textbox`) เพราะ CTkTextbox เองไม่มี
        # API ทำ tag สีให้โดยตรง
        text_widget = self.log_box._textbox
        text_widget.tag_config("time", foreground=COLORS["console_time"])
        text_widget.tag_config("normal", foreground=COLORS["console_text"])
        text_widget.tag_config("success", foreground=COLORS["console_success"])
        text_widget.tag_config("warning", foreground=COLORS["console_warning"])
        text_widget.tag_config("empty", foreground=COLORS["console_empty"])

        self._show_empty_log_placeholder()

    def _show_empty_log_placeholder(self):
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.insert("end", "ยังไม่มีบันทึก — กดปุ่มเริ่มทำงานเพื่อดูผลลัพธ์", ("empty",))
        self.log_box.configure(state="disabled")
        self._has_real_log = False

    def _clear_log(self):
        self._show_empty_log_placeholder()

    def _save_log_to_file(self):
        content = self.log_box.get("1.0", "end").strip()
        if not content:
            messagebox.showinfo("ไม่มีข้อมูล", "ยังไม่มีบันทึกให้บันทึกไฟล์")
            return
        # ใส่วันที่-เวลาไว้ในชื่อไฟล์เริ่มต้นเสมอ — กันเซฟทับไฟล์เดิมโดยไม่ตั้งใจ
        # เวลาเซฟ log จากหลายรอบการรันในวันเดียวกัน ทำให้แยกได้ว่าไฟล์ไหนคือรอบไหน
        default_name = f"rpa-bot-log_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        path = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=[("Text file", "*.txt"), ("All files", "*.*")],
            initialfile=default_name,
        )
        if not path:
            return
        with open(path, "w", encoding="utf-8") as f:
            f.write(content + "\n")
        messagebox.showinfo("บันทึกแล้ว", f"บันทึกไฟล์ log ไว้ที่:\n{path}")

    # จำแนกสีบรรทัดล็อกจากเนื้อความ (heuristic ง่ายๆ) — ไม่ได้แก้ตัว main.py/
    # rms_bot.py เลย แค่ตีความข้อความที่พิมพ์ออกมาอยู่แล้วให้มีสีต่างกันในคอนโซล
    @staticmethod
    def _classify_line(line):
        if any(kw in line for kw in ("ข้อผิดพลาด", "ล้มเหลว", "error", "needs_review", "ข้าม")):
            return "warning"
        if any(kw in line for kw in ("สำเร็จ", "เสร็จสิ้น")):
            return "success"
        return "normal"

    def _append_log(self, text):
        # ลบข้อความ placeholder "ยังไม่มีบันทึก..." ทิ้งตอนมีข้อความจริงเข้ามาครั้งแรก
        if not self._has_real_log:
            self.log_box.configure(state="normal")
            self.log_box.delete("1.0", "end")
            self.log_box.configure(state="disabled")
            self._has_real_log = True

        for line in text.splitlines():
            if not line.strip():
                continue
            self._parse_progress(line)
            timestamp = datetime.datetime.now().strftime("%H:%M:%S")
            tag = self._classify_line(line)
            self.log_box.configure(state="normal")
            self.log_box.insert("end", f"{timestamp}  ", ("time",))
            self.log_box.insert("end", line + "\n", (tag,))
            self.log_box.see("end")
            self.log_box.configure(state="disabled")

    def _parse_progress(self, line):
        # อ่านความคืบหน้าจากข้อความที่ main.py พิมพ์ออกมาอยู่แล้ว (ไม่ได้แก้ main.py
        # เลย) เพื่อขับ progress bar — "พบ N รายการรอดำเนินการ" ตั้งค่ารวม แล้วนับ
        # จำนวนครั้งที่เจอ "--- กำลังประมวลผล ..." เพิ่มทีละ 1
        match_total = re.search(r"พบ\s+(\d+)\s+รายการรอดำเนินการ", line)
        if match_total:
            self.total_count = int(match_total.group(1))
            self.done_count = 0
            self._update_progress()
            return
        if re.search(r"---\s*กำลังประมวลผล", line):
            self.done_count += 1
            self._update_progress()

    def _update_progress(self):
        total = max(self.total_count, 0)
        done = min(self.done_count, total) if total else self.done_count
        pct = int(round((done / total) * 100)) if total else 0
        self.progress_count_label.configure(text=f"{done} / {total} ({pct}%)")
        self.progress_bar.set(pct / 100 if total else 0)
        self.progress_label.configure(text="กำลังประมวลผลรายการ" if self.is_running else "ความคืบหน้า")

    def _run_bot(self, dry_run):
        if self.process is not None:
            messagebox.showwarning("กำลังทำงานอยู่", "บอทกำลังทำงานอยู่ กรุณารอให้เสร็จก่อน")
            return

        mode = "test" if dry_run else "real"
        self._update_mode_visual(mode)

        self.is_running = True
        self.total_count = 0
        self.done_count = 0
        self.test_btn.configure(state="disabled")
        self.real_btn.configure(state="disabled")
        self._set_status(running=True, mode=mode)
        self._update_progress()

        mode_label = "ทดสอบ (dry run)" if dry_run else "รันจริง"
        self._append_log(f"{'=' * 50}\nเริ่ม{mode_label}...\n{'=' * 50}")

        args = [sys.executable, "main.py"]
        if dry_run:
            args.append("--dry-run")

        # บังคับให้โปรเซสลูก (main.py) พิมพ์ผลลัพธ์เป็น UTF-8 เสมอ — ค่าเริ่มต้นของ
        # Python บน Windows เวลารันแบบไม่ได้ติดอยู่กับหน้าต่าง console จริงๆ (ถูกไพป์
        # เข้ามาที่นี่) มักจะยึดรหัสหน้าโค้ดของระบบ (เช่น cp874) แทน UTF-8 ทำให้
        # ภาษาไทยในคอนโซลล็อกกลายเป็นตัวอักษรมั่ว (ฝั่งนี้ decode เป็น utf-8 อยู่แล้ว
        # แต่ถ้าฝั่งลูก encode มาเป็นคนละชุดกัน ก็ยังพังอยู่ดี) ตั้งทั้งคู่ให้ตรงกัน
        child_env = os.environ.copy()
        child_env["PYTHONIOENCODING"] = "utf-8"
        child_env["PYTHONUTF8"] = "1"

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
                    env=child_env,
                )
                for line in self.process.stdout:
                    self.after(0, self._append_log, line)
                self.process.wait()
            except Exception as e:
                self.after(0, self._append_log, f"เกิดข้อผิดพลาด: {e}")
            finally:
                self.process = None
                self.after(0, self._on_run_finished)

        threading.Thread(target=worker, daemon=True).start()

    def _on_run_finished(self):
        self.is_running = False
        self.test_btn.configure(state="normal")
        self.real_btn.configure(state="normal")
        self._set_status(running=False, mode=self.current_mode)
        self._update_progress()
        self._append_log("--- เสร็จสิ้น ---")


if __name__ == "__main__":
    app = BotControlPanel()
    app.mainloop()
