"""
app_paths.py — หาตำแหน่งโฟลเดอร์ของโปรแกรมให้ถูกทั้งตอนรันจากซอร์สโค้ด (python main.py)
และตอนรันเป็นไฟล์ .exe ที่ห่อด้วย PyInstaller

ทำไมต้องแยกออกมา: ในโปรแกรม .exe ตัวแปร __file__ ชี้เข้าไปในโฟลเดอร์ _internal
ที่ PyInstaller สร้าง ไม่ใช่โฟลเดอร์ที่ผู้ใช้เห็นและแก้ไขได้ — ไฟล์ที่ต้องเขียน/แก้เอง
(ไฟล์ล็อกกันรันซ้อน, config.json, โฟลเดอร์ logs, เบราว์เซอร์ที่ฝังมา) ต้องอยู่ "ข้างๆ"
ตัว .exe เสมอ
"""

import os
import sys


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def app_dir() -> str:
    if is_frozen():
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))
