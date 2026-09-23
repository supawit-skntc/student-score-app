# -*- mode: python ; coding: utf-8 -*-
# สเปกสำหรับ PyInstaller — สร้าง 2 โปรแกรมในโฟลเดอร์เดียวกัน (ใช้ไลบรารีร่วมกัน ไม่ซ้ำ):
#   RMS-Bot.exe          หน้าต่างควบคุม (ไม่มีจอดำ)
#   rms-bot-runner.exe   ตัวรันบอท (console) ใช้กับปุ่มในหน้าต่าง และ Task Scheduler
# ห้ามรันไฟล์นี้ตรงๆ — ใช้ build_exe.bat (มันเตรียม Chromium/ไอคอนให้ก่อนแล้วค่อยเรียกไฟล์นี้)

from PyInstaller.utils.hooks import collect_all, copy_metadata

datas, binaries, hiddenimports = [], [], []
for pkg in ("customtkinter", "playwright"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

# keyring ค้นหา backend ผ่าน entry points (metadata ของแพ็กเกจ) — ถ้าไม่ฝัง metadata
# ไปด้วย โปรแกรมที่ห่อแล้วจะหา Windows Credential Manager ไม่เจอ ("no backend")
datas += copy_metadata("keyring")
hiddenimports += ["keyring.backends.Windows", "win32ctypes.pywin32.win32cred", "win32ctypes.pywin32.pywintypes"]

ICON = "build_assets/app.ico"

gui_a = Analysis(
    ["rpa_gui_app.py"], pathex=["."], binaries=binaries, datas=datas,
    hiddenimports=hiddenimports, noarchive=False,
)
run_a = Analysis(
    ["rpa_runner_app.py"], pathex=["."], binaries=binaries, datas=datas,
    hiddenimports=hiddenimports, noarchive=False,
)
MERGE((gui_a, "rpa_gui_app", "RMS-Bot"), (run_a, "rpa_runner_app", "rms-bot-runner"))

gui_pyz = PYZ(gui_a.pure)
run_pyz = PYZ(run_a.pure)

gui_exe = EXE(
    gui_pyz, gui_a.scripts, [], exclude_binaries=True, name="RMS-Bot",
    console=False, icon=ICON, upx=False,
)
run_exe = EXE(
    run_pyz, run_a.scripts, [], exclude_binaries=True, name="rms-bot-runner",
    console=True, icon=ICON, upx=False,
)

COLLECT(
    gui_exe, gui_a.binaries, gui_a.datas,
    run_exe, run_a.binaries, run_a.datas,
    strip=False, upx=False, name="RMS-Bot",
)
