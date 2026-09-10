# Handoff: ปรับ UI ระบบตัดคะแนนความประพฤติ (RMS) — วิทยาลัยเทคนิคสมุทรสาคร

## วิธีใช้ไฟล์ชุดนี้กับ Claude Code (สรุปสั้น)

1. ดาวน์โหลดโฟลเดอร์นี้ แล้ววางไว้ในโปรเจกต์จริงของคุณ (เช่น `student-score-app/design_handoff_rms_ui/`)
2. เปิด terminal ที่โฟลเดอร์โปรเจกต์ แล้วรัน `claude`
3. สั่ง Claude Code ด้วยข้อความประมาณนี้:

```
อ่าน design_handoff_rms_ui/README.md และไฟล์ "RMS UI ใหม่.dc.html" ในโฟลเดอร์เดียวกัน
นั่นคือ design reference (ไม่ใช่โค้ดที่จะ copy ตรง ๆ)
ให้ปรับ UI ของโปรเจกต์ React + Tailwind นี้ให้ตรงกับดีไซน์นั้น
โดยห้ามแก้ logic / การเรียก API / โครงสร้าง state ที่มีอยู่
แก้ไฟล์: src/index.css, src/layouts/DashboardLayout.jsx, src/pages/Login.jsx,
src/pages/Dashboard.jsx, src/pages/DeductionForm.jsx, src/pages/Report.jsx,
src/pages/StudentProfile.jsx
ทำทีละไฟล์ แล้วให้ผม review ก่อนไปไฟล์ถัดไป
```

4. แนะนำให้แตะ branch ใหม่ก่อน: `git checkout -b ui-refresh` เพื่อย้อนกลับได้ง่าย
5. รัน `npm run dev` ตรวจทั้งบนคอมพิวเตอร์ และย่อหน้าต่างให้แคบ ~390px (หรือ DevTools → iPhone) เพื่อตรวจมือถือ

---

## Overview

ระบบเดิม (React + Vite + Tailwind v4 + Google Apps Script backend) ใช้งานได้ครบแล้ว
งานนี้คือ **ปรับ UI ให้สวยและใช้งานสะดวกขึ้น โดยฟังก์ชันการทำงานเดิมทั้งหมดต้องเหมือนเดิม**
จุดสำคัญคือใช้งานได้ดีทั้งบนคอมพิวเตอร์และมือถือ (ครูงานปกครองบันทึกจากมือถือหน้างาน)

## About the Design Files

ไฟล์ `RMS UI ใหม่.dc.html` ในโฟลเดอร์นี้เป็น **design reference ที่ทำด้วย HTML** —
เป็นต้นแบบแสดง "หน้าตาและพฤติกรรมที่ต้องการ" พร้อมข้อมูลจำลอง **ไม่ใช่โค้ด production ที่จะก็อปไปใช้**

งานของผู้พัฒนาคือ **สร้างดีไซน์นี้ขึ้นใหม่ในโค้ดเบสเดิม** (React + Tailwind v4 + lucide-react + SweetAlert2)
ตามแพตเทิร์นที่โปรเจกต์ใช้อยู่ ไม่ต้องเพิ่ม dependency ใหม่

ปุ่มสลับ "คอมพิวเตอร์ / มือถือ" ที่แถบดำด้านบนของไฟล์ต้นแบบ **เป็นเครื่องมือดูตัวอย่างเท่านั้น — ไม่ต้องทำในระบบจริง**
ในระบบจริงให้ใช้ Tailwind responsive breakpoints (`md:` = 768px) แทน

## Fidelity

**High-fidelity** — สี ตัวอักษร ระยะห่าง มุมโค้ง เงา และ state ต่าง ๆ กำหนดไว้ครบตามด้านล่าง
ให้ทำตามค่าที่ระบุ (ซึ่งอ้างอิงจาก `@theme` เดิมใน `src/index.css` เป็นหลัก)

---

## Design Tokens

โทเคนเดิมใน `src/index.css` ใช้ได้เกือบทั้งหมด สิ่งที่ต้อง **เพิ่ม/แก้** คือกลุ่ม neutral ให้เป็นโทนอุ่น
(เลิกใช้ `slate-*` ที่เป็นสีเทาอมฟ้า เพราะตีกับแดงการ์เน็ต)

### สีที่ใช้ (เพิ่มใน `@theme` ของ src/index.css)

```css
@theme {
  /* --- คงเดิม: brand (garnet) + gold (brass) --- */

  /* neutral โทนอุ่น — ใช้แทน slate-* ทั้งระบบ */
  --color-ink:      #2A1B20;  /* ตัวหนังสือหลัก */
  --color-ink-soft: #5A484D;  /* label, ตัวหนังสือรอง */
  --color-ink-mute: #8A7A7E;  /* คำอธิบาย, subtitle */
  --color-ink-faint:#A29094;  /* meta, timestamp */
  --color-line:     #EFE6E4;  /* เส้นขอบการ์ด */
  --color-line-soft:#F7F1EF;  /* เส้นคั่นในตาราง/รายการ */
  --color-field:    #FCFAFA;  /* พื้น input ปกติ */
  --color-canvas:   #F7F5F2;  /* พื้นหลังพื้นที่เนื้อหา (เดิม) */

  /* semantic */
  --color-ok-bg: #E9F6F0;  --color-ok-fg: #0B5F48;
  --color-warn-bg:#FDF0DE;  --color-warn-fg:#8A5A0B;
  --color-bad-bg:#FDECEF;  --color-bad-fg:#B03A50;
}
```

สีแบรนด์ที่ใช้บ่อย (จากธีมเดิม): `brand-800 #4A1624`, `brand-700 #5C1D2C`, `brand-600 #742537`,
`brand-500 #8A2E42`, `brand-200 #E4AEB7`, `brand-50 #FBEEF0`,
`gold-500 #B8860F`, `gold-300 #E4BB5C`, `gold-50 #FBF4E3`, `gold-700 #74530A`

### Typography
- หัวเรื่อง / ปุ่ม / ตัวเลขสถิติ: **Kanit** (`font-display`) น้ำหนัก 500–600
- เนื้อหา / ฟอร์ม / ตาราง: **Sarabun** (`font-sans`) น้ำหนัก 400–700
- สเกล: หัวหน้าจอ 17px/500 · หัวการ์ด 15px/500 · เนื้อหา 13.5–15px · label 13px/600 · meta 11.5–12.5px · ตัวเลขสถิติ 30px/600 · ตัวเลขคะแนนสะสม 42px/600
- **ห้ามใช้ต่ำกว่า 11.5px** และบนมือถือ input ต้อง ≥15px (กัน iOS zoom อัตโนมัติเวลาโฟกัส)

### Radius / Shadow / Spacing
- Radius: การ์ดใหญ่ `20–22px` · input & ปุ่มเล็ก `13–14px` · ปุ่มหลัก `15px` · pill `999px` · ไอคอนกรอบ `10–12px`
- เงาการ์ด: ไม่ใช้เงา ใช้ `border: 1px solid var(--color-line)` แทน (สะอาดกว่าเดิม)
- เงาปุ่มหลัก: `0 10px 22px -12px rgba(92,29,44,.9)`
- เงา modal: `0 30px 60px -20px rgba(26,6,12,.6)`
- Gap มาตรฐาน: การ์ดต่อการ์ด `18px` (desktop) / `12–14px` (mobile) · ฟิลด์ในฟอร์ม `14px`
- Padding: การ์ด `18px` · main desktop `22px 24px 28px` · main mobile `14px 14px 20px`
- **ทุกเป้าแตะบนมือถือสูง ≥44px** (input/ปุ่มในฟอร์มใช้ `min-h-[48px]`, ปุ่มหลัก `min-h-[52px]`)

---

## Screens / Views

### 1. Login (`src/pages/Login.jsx`)
**Purpose:** เข้าสู่ระบบสำหรับครูงานปกครอง / ผู้ดูแลระบบ

**Layout:** จัดกลางจอ ความกว้างการ์ดสูงสุด 400px, padding 36px 20px

- พื้นหลัง: `radial-gradient(120% 90% at 15% 0%, #742537 0%, #4A1624 45%, #38101A 100%)`
  + วงกลมเบลอ 2 วง (`rgba(184,134,15,.16)` มุมซ้ายบน 420px, `rgba(255,255,255,.07)` มุมขวาล่าง 380px, `filter: blur(70px)`, `pointer-events-none`)
- โลโก้ 78×78 + `drop-shadow(0 8px 18px rgba(0,0,0,.35))`
- ชื่อวิทยาลัย: Kanit 22px/500 สีขาว
- ป้ายชื่อระบบ: pill `rgba(255,255,255,.1)` + จุดกลม 6px สี `#E4BB5C` + ข้อความ 12.5px สี `#F3D6DA`
- การ์ดฟอร์ม: `#fff`, radius 22px, padding 26px 24px 24px, เงา `0 24px 60px -20px rgba(26,6,12,.65)`
  - หัว "เข้าสู่ระบบ" Kanit 17px/500 + คำอธิบาย 13px `#8A7A7E`
  - Input: `min-h 50px`, padding 13px 15px, border `1.5px #E3D9DA`, radius 14px, พื้น `#FBF9F8`
    - focus: `border-color:#8A2E42; background:#fff; box-shadow:0 0 0 4px rgba(228,187,92,.35)`
  - ปุ่มเข้าสู่ระบบ: full width, `min-h 52px`, radius 14px, `linear-gradient(180deg,#742537,#5C1D2C)`, Kanit 16px/500
    - hover: `linear-gradient(180deg,#8A2E42,#742537)` · active: `translateY(1px)`
    - loading: คงพฤติกรรมเดิม (`Loader2` หมุน + ข้อความ "กำลังตรวจสอบข้อมูล...")
- ท้ายการ์ด: ชื่องาน 11.5px `rgba(243,214,218,.6)` จัดกลาง

**คงเดิมทั้งหมด:** `handleLogin`, `callAPI('login')`, การเก็บ `currentUser` + token ลง localStorage, SweetAlert ทุกจุด

### 2. Shell / Layout (`src/layouts/DashboardLayout.jsx`)
นี่คือไฟล์ที่เปลี่ยนมากที่สุด — **เดิมมือถือใช้ sidebar drawer + hamburger, ใหม่ใช้แถบเมนูล่าง**

**Desktop (md ขึ้นไป)**
- Sidebar กว้าง **262px**, `linear-gradient(180deg,#4A1624,#38101A)`
  - หัว: โลโก้ 38px + "วท.สมุทรสาคร" (Kanit 15px/500) + "ตัดคะแนนความประพฤติ" (11px `rgba(243,214,218,.65)`) · เส้นล่าง `1px rgba(255,255,255,.09)`
  - เมนูแบ่ง 2 กลุ่มพร้อมหัวกลุ่ม 10.5px/700 letter-spacing .1em สี `rgba(243,214,218,.45)`:
    - "การทำงานประจำวัน" → แผงควบคุม, บันทึกตัดคะแนน, รายงาน, ประวัตินักเรียน
    - "ผู้ดูแลระบบ" → จัดการผู้ใช้งาน, ประวัติการทำงานระบบ (แสดงเมื่อ `isAdmin` เท่านั้น — เหมือนเดิม)
  - ปุ่มเมนู: `min-h 46px`, padding 0 14px, radius 13px, Kanit 14.5px/500, ไอคอน lucide 19px, gap 12px
    - active: `bg-gold-500 text-brand-900` + `box-shadow:0 6px 14px -8px rgba(184,134,15,.9)`
    - ปกติ: โปร่งใส สี `rgba(251,238,240,.86)` · hover: `bg-white/10`
  - การ์ดผู้ใช้ล่างสุด: `rgba(255,255,255,.06)` radius 16px margin 14px — อวาตาร์ 36px วงกลม `#B8860F` ตัวอักษร `#38101A`, ชื่อ 13px/600, บทบาท 11px, ปุ่มออกจากระบบ `min-h 40px` border `rgba(255,255,255,.16)` สีตัวอักษร `#F3D6DA`
- Header: พื้นขาว padding 16px 24px, เส้นล่าง `1px #EFE6E4`
  - ซ้าย: ชื่อหน้า Kanit 17px/500 `#2A1B20` + subtitle 12.5px `#8A7A7E` (ใช้ `PAGE_META` เดิม)
  - ขวา: pill "ปีการศึกษา 2569" (พื้น `#F7F1EF`, อวาตาร์ 26px `#8A2E42`, ข้อความ 12.5px/600)
- `main`: `overflow-auto`, padding 22px 24px 28px, พื้น `#F7F5F2`

**Mobile (ต่ำกว่า md)**
- Header sticky top: padding 12px 14px — โลโก้ 34px + ชื่อหน้า (ซ่อน subtitle) + อวาตาร์วงกลม 34px + ปุ่มออกจากระบบไอคอน 40×40 (border `1px #EADFDF`, radius 12px, สี `#B03A50`)
  - **สำคัญ:** บนมือถือให้ย่อ pill ปีการศึกษาเป็นอวาตาร์วงกลมเท่านั้น ไม่งั้นชื่อหน้าจะถูกตัดคำ
- **แถบเมนูล่าง (bottom tab bar)** แทน drawer: `position:sticky; bottom:0`, padding 8px 6px 10px,
  พื้น `rgba(255,255,255,.97)` + `backdrop-filter: blur(8px)`, เส้นบน `1px #EFE6E4`, เงา `0 -8px 24px -16px rgba(56,16,26,.4)`
  - 4 แท็บ: แผงควบคุม · รายงาน · (ปุ่มกลาง) · ประวัติ · ผู้ใช้งาน
  - แต่ละแท็บ: `min-w 60px; min-h 52px`, ไอคอน 21px + ข้อความ 11px/600, radius 12px
    - active: สี `#8A2E42` พื้น `#FBEEF0` · ปกติ: `#A29094`
  - **ปุ่มกลาง "บันทึก" (FAB)**: 52×52, `margin-top:-22px`, radius 18px,
    `linear-gradient(160deg,#8A2E42,#5C1D2C)`, ไอคอน + 26px สีขาว, เงา `0 10px 20px -8px rgba(92,29,44,.85)` → ไปหน้า `form`
  - แท็บ "ผู้ใช้งาน" แสดงเมื่อ `isAdmin` เท่านั้น; ถ้าไม่ใช่ admin ให้เหลือ 4 ช่อง (ประวัติการทำงานระบบเข้าถึงได้จาก desktop)

**คงเดิมทั้งหมด:** `NAV_ITEMS`/`PAGE_META`, `handleLogout` (SweetAlert + `callAPI('logout')` + ลบ localStorage), การซ่อนเมนู admin-only, prop `setView`/`view`

### 3. Dashboard (`src/pages/Dashboard.jsx`)
**Purpose:** ภาพรวมการตัดคะแนน

- **แถบสรุป 5 การ์ด**: `grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap:12px`
  (บนมือถือได้ 2 คอลัมน์อัตโนมัติ — ไม่ต้องเขียน breakpoint)
  - การ์ดที่ 1 "เอกสารทั้งหมด" เป็นการ์ดเน้น: `linear-gradient(160deg,#5C1D2C,#38101A)` ตัวหนังสือขาว,
    เงา `0 12px 28px -18px rgba(56,16,26,.9)`, ตัวเลข Kanit 30px/600, meta สี `rgba(228,187,92,.95)`
  - การ์ดที่ 2–4: พื้นขาว border `1px #EFE6E4` radius 18px padding 16px 18px
    label 12.5px `#8A7A7E` · ตัวเลข Kanit 30px/600 (สีตามความหมาย: ปกติ `#2A1B20`, คะแนนหัก `#B03A50`, สำเร็จ `#0F7A5A`)
  - การ์ด "บันทึกเข้า RMS แล้ว" มี progress bar สูง 5px radius 99px (`#EDF3F0` / เติม `#0F7A5A`) = syncedCount ÷ total
  - การ์ด "รอบันทึกเข้า RMS": พื้น `#FEFAF0` border `#F0E1BE` ตัวเลข `#74530A`
- **การ์ดนักเรียนถึงเกณฑ์ (ข้อ 8.3)**: การ์ดขาว radius 20px
  - หัวการ์ด: ไอคอนสามเหลี่ยมเตือน 32px กรอบ `#FDECEF` สี `#B03A50` + หัวข้อ Kanit 15px + คำอธิบาย 12px + pill นับจำนวนคน (`#FDECEF`/`#B03A50` 12.5px/700)
  - แต่ละแถว: กล่องคะแนน 52×52 radius 17px, Kanit 19px/600 — สีตามเกณฑ์: ≥30 `#FDECEF`/`#B03A50` · ≥20 `#FDF0DE`/`#8A5A0B` · ≥15 `#FBF4E3`/`#74530A`
    ตามด้วยชื่อ 14.5px/600, meta 12px, pill ข้อบังคับที่ต้องดำเนินการ (`#FBF4E3`/`#74530A` 11.5px/600),
    ปุ่ม "ดูประวัติ" `min-h 40px` border `1px #EADFDF` (hover `#FBEEF0` border `#E4AEB7`) → เรียก `onViewStudent(studentId)` เดิม
  - แถวใช้ `flex-wrap` เพื่อให้พับบรรทัดสวยบนมือถือ
- **2 การ์ดล่าง**: `grid-template-columns: repeat(auto-fit, minmax(280px,1fr)); gap:18px`
  - "ฐานความผิดที่พบบ่อย": แต่ละรายการ = ชื่อ 13.5px/500 + จำนวน 700 สี `#742537`
    + bar สูง 8px radius 99px พื้น `#F5EDEB` เติม `linear-gradient(90deg,#8A2E42,#B8860F)` (อันดับ 1) / `…,#A64358` (อันดับอื่น) — ความกว้าง = count ÷ maxCount
  - "คะแนนสะสมสูงสุด": อันดับ `#1..#5` (Kanit 13px/600 `#B9A5A8`) + ชื่อ 14px/600 + meta 11.5px + pill คะแนน (≥20 → `#FDECEF`/`#B03A50`, อื่น → `#F7F1EF`/`#5A484D`)
- การ์ด RPA Bot (admin เท่านั้น) — ใช้สไตล์การ์ดเดียวกัน (border `#EFE6E4`, radius 20px, padding 18px)
- Loading state: คงเดิม (`Loader2` + "กำลังโหลดข้อมูล...") แต่เปลี่ยนสีตัวอักษรเป็น `#8A7A7E`

**คงเดิมทั้งหมด:** การคำนวณ `stats` ใน `useMemo`, `statusForPoints`, การกรองปีการศึกษา, `getRecords`/`getRpaStats`, สิทธิ์ admin

### 4. DeductionForm (`src/pages/DeductionForm.jsx`)
**Purpose:** บันทึกรายการตัดคะแนนใหม่ (ใช้บนมือถือมากที่สุด)

`max-w-[760px] mx-auto`, การ์ดเรียงเป็นคอลัมน์ gap 16px

- **แถบ AI สแกนบัตร**: label ครอบ input file (โปร่งใสทับเต็มพื้นที่ — เหมือนเดิม)
  - border `2px dashed #E4AEB7`, radius 20px, พื้น `#FDF4F5` (hover `#FBEEF0` border `#A64358`), padding 20px
  - ไอคอนกล้อง 52×52 radius 16px `linear-gradient(160deg,#742537,#4A1624)` สีขาว
  - หัวข้อ Kanit 15.5px/500 `#4A1624` "ถ่ายรูป / อัปโหลดบัตรนักเรียน" + คำอธิบาย 12.5px `#8A5A66`
  - ระหว่างสแกน: แสดง `ocrProgress` เดิม + `Loader2` (คงพฤติกรรม/ข้อความเดิมทั้งหมด)
- **การ์ด "ข้อมูลนักเรียน"**: หัวการ์ด = ไอคอน 30px กรอบ `#FBEEF0` สี `#742537` + ข้อความ Kanit 15px/500 + เส้นคั่น `1px #F3EBE9`
  - ฟิลด์: `grid repeat(auto-fit, minmax(200px,1fr)); gap:14px` → รหัส / ชื่อ-นามสกุล / สาขาวิชา / (ระดับ+ปีที่+ห้อง เป็น grid 3 ช่อง gap 8px)
  - Input: `min-h 48px`, padding 12px 14px, border `1.5px #E3D9DA`, radius 13px, พื้น `#FCFAFA`, 15px
    - focus: `border-color:#8A2E42; background:#fff; box-shadow:0 0 0 4px rgba(228,187,92,.3)`
  - label: 13px/600 `#5A484D`, margin-bottom 6px
  - **ฟิลด์ "คำนำหน้า" เดิมรวมเข้ากับ "ชื่อ-นามสกุล"** ได้ ถ้าจะคงไว้ให้ใช้ grid 1:2 เหมือนเดิม (state `nameTitle` ต้องยังส่งไป backend เหมือนเดิม)
- **การ์ด "รายละเอียดความผิด"**: หัวการ์ดไอคอน `#FDECEF`/`#B03A50`
  - **เปลี่ยนสำคัญ: `<select>` ฐานความผิด → ชิปแบบแตะ** (เร็วกว่ามากบนมือถือ)
    - `flex-wrap; gap:8px`; ชิป `min-h 44px`, padding 0 14px, radius 14px, 13.5px/600
      - ปกติ: border `1.5px #EADFDF` พื้นขาว สี `#5A484D`
      - เลือกแล้ว: border `1.5px #8A2E42` พื้น `#FBEEF0` สี `#742537`
    - ในชิปมี badge คะแนน: pill 11.5px/700 — ปกติ `#F7F1EF`/`#8A7A7E`, เลือกแล้ว `#8A2E42`/ขาว; ค่าเป็น `-{points}` หรือ "ระบุเอง" (กรณี `points == null`)
    - ใช้ `OFFENSES` จาก `src/data/offenses.js` ตามเดิม และยัง **เติมคะแนนอัตโนมัติ** ด้วย logic `handleOffenseChange` เดิม
    - ถ้ามี `note` → กล่องเตือน padding 11px 14px radius 13px พื้น `#FBF4E3` สี `#74530A` 12.5px
    - เลือก "อื่นๆ" → แสดง input `otherOffense` (required) พื้น `#FFF7F8` border `1.5px #F0CDD4` — พฤติกรรมเดิม
  - ฟิลด์ "ตัดคะแนน": `min-h 48px`, border `1.5px #F0CDD4`, พื้น `#FFF7F8`, 17px/700 สี `#B03A50`
    + คำอธิบายใต้ฟิลด์ 11.5px `#A29094` = "ค่าเริ่มต้นตาม{ref} — แก้ไขได้หากมีเหตุอันควร"
  - ฟิลด์ "วันที่กระทำผิด": `type="date"` สไตล์เดียวกับ input ทั่วไป
- **แถบบันทึก**
  - Desktop: การ์ดขาว border `1px #EFE6E4` radius 20px padding 14px 18px — ซ้ายแสดง "ผู้บันทึก: {user.name}" 12.5px `#8A7A7E`, ขวาปุ่มบันทึก
  - Mobile: `position:sticky; bottom:0` เต็มความกว้าง (ลบ margin ด้านข้างของ main ออก) พื้น `rgba(255,255,255,.97)` เส้นบน `1px #EFE6E4`
  - ปุ่ม "บันทึกข้อมูล": `min-h 52px`, padding 0 26px, radius 15px, `linear-gradient(180deg,#742537,#5C1D2C)`, Kanit 16px/500, เงา `0 10px 22px -12px rgba(92,29,44,.9)`
- **แถบแจ้งบันทึกสำเร็จ** (เสริมจาก SweetAlert เดิม ถ้าต้องการ): พื้น `#E9F6F0` border `1px #BEE3D3` สี `#0B5F48` radius 16px padding 14px 16px 13.5px/600

**คงเดิมทั้งหมด:** `formData` ทุกคีย์, `handleImageUpload` + `callAPI('ocrScan')` + `parseOcrCardData`, `handleSubmit` + `callAPI('addRecord')`, การเคลียร์ฟอร์ม, SweetAlert ทุกจุด, `teacherName` จาก localStorage

### 5. Report (`src/pages/Report.jsx`)
**Purpose:** ค้นหา/กรอง/แก้ไข/ลบรายการ

- **การ์ดค้นหา+ตัวกรอง** (ขาว border `1px #EFE6E4` radius 20px padding 16px)
  - ช่องค้นหา: `flex:1; min-w 200px`, `min-h 48px`, padding-left 42px + ไอคอน search 18px `#B9A5A8`, border `1.5px #E3D9DA`, radius 14px
  - ปุ่ม "ตัวกรอง" `min-h 48px` เปิด/ปิดแถวชิปตัวกรอง (แทนแถวตัวกรองที่กางค้างไว้เดิม — บนมือถือประหยัดที่มาก)
  - แถวชิปตัวกรอง: `ปวช. · ปวส. · รอส่ง RMS · คะแนนสะสม ≥ 20` — ชิป `min-h 42px` radius 13px 13px/600
    (ปกติ border `1.5px #EADFDF` ขาว `#5A484D` / เลือก border `1.5px #8A2E42` พื้น `#FBEEF0` `#742537`)
    - **ต้องแมปกับ state ตัวกรองเดิมให้ครบ**: `filterLevel`, `filterMajor`, `filterHighRisk`, `filterFrom`/`filterTo`
      (สาขาวิชา = ใช้ `<select>` เดิมได้ในแถวนี้; ช่วงวันที่ = input date 2 ช่องในแถวนี้)
    - ยังต้องมีปุ่ม "ล้างตัวกรอง" เมื่อ `hasActiveFilters` และคำเตือน ⚠ ของ `filterHighRisk && !seesAllRecords` เหมือนเดิม
  - แถวสรุป: "พบ **{n}** รายการ" 12.5px `#8A7A7E`
- **Desktop: ตาราง** — `section` radius 20px `overflow:hidden` ครอบ **div `overflow-x:auto`**
  - หัวตาราง + แถวใช้ grid คอลัมน์เดียวกัน: `110px 108px minmax(160px,1.4fr) minmax(170px,1.4fr) 78px 130px 96px; gap:10px; min-width:920px`
    (⚠ `min-width` + wrapper `overflow-x:auto` จำเป็น ไม่งั้นคอลัมน์ขวาถูกตัดจนกดปุ่มไม่ได้ — ใช้ `overflow-x-auto` แบบเดิมของโปรเจกต์ก็ได้)
  - หัวตาราง: พื้น `#FAF6F4` เส้นล่าง `1px #F0E7E4` ตัวอักษร 11px/700 letter-spacing .04em `#8A7A7E`
  - แถว: padding 13px 18px, เส้นล่าง `1px #F7F1EF`, 13.5px, hover `#FDF7F6`
    - วันที่ `#8A7A7E` · รหัส 700 `#742537` · ชื่อ 600 + บรรทัดสอง meta 11.5px `#A29094` · ฐานความผิด `#5A484D`
    - คะแนน: pill `#FDECEF`/`#B03A50` 12.5px/700 แสดง `-{points}`
    - สถานะ RMS: pill 11.5px/700 — `synced` `#E9F6F0`/`#0B5F48` "เข้า RMS แล้ว" · `pending` `#FBF4E3`/`#74530A` "รอส่ง RMS" · `needs_review` `#FDF0DE`/`#8A5A0B` "ต้องตรวจสอบ" · `error` `#FDECEF`/`#B03A50` "ผิดพลาด"
    - ปุ่มจัดการ 34×34 radius 10px: ประวัติ `#FBEEF0`/`#742537` · แก้ไข `#FBF4E3`/`#74530A` · PDF `#FBEEF0`/`#742537` · ลบ (admin) `#FDECEF`/`#B03A50`
- **Mobile: การ์ดรายรายการ** (แทนตาราง)
  - การ์ดขาว border `1px #EFE6E4` radius 18px padding 14px, gap 10px
  - บรรทัดบน: ชื่อ 15px/600 + รหัส·ระดับ 12px `#8A7A7E` / ขวา pill คะแนน 13.5px/700
  - กล่องฐานความผิด: พื้น `#FAF6F4` radius 12px padding 9px 12px 13px `#5A484D`
  - บรรทัดล่าง: วันที่ 12px `#A29094` + pill สถานะ / ปุ่ม "ประวัติ" + "แก้ไข" `min-h 44px` (+ ลบ/PDF ตามสิทธิ์)
- **Empty state**: การ์ดขาว padding 48px 20px จัดกลาง — "ไม่พบข้อมูลที่ค้นหา" Kanit 15px `#5A484D` + "ลองแก้คำค้นหรือล้างตัวกรอง" 13px `#A29094`
- **Modal แก้ไข** (`src/components/EditRecordModal.jsx`): overlay `rgba(42,27,32,.55)`, การ์ด `max-w 420px` radius 22px padding 20px เงา `0 30px 60px -20px rgba(26,6,12,.6)`
  - หัว Kanit 17px/500 + meta 12.5px `#8A7A7E`; ฟิลด์สไตล์เดียวกับฟอร์มหลัก; ปุ่มล่าง 2 ปุ่ม `min-h 50px` (ยกเลิก = ขาว border `1px #EADFDF` / บันทึก = แดงไล่เฉด)
  - บนมือถือให้เป็น bottom sheet (`radius 24px 24px 0 0`, ชิดล่าง) จะจับง่ายกว่า

**คงเดิมทั้งหมด:** `getMyRecords`, `updateRecord`, `deleteRecord` (+ SweetAlert คำเตือน synced), `openEditModal` (แยก "อื่นๆ:"), `studentTotals`/`useMemo`, สิทธิ์ admin/`canViewAllRecords`, `onViewStudent`

### 6. StudentProfile (`src/pages/StudentProfile.jsx`)
- **แถวชิปเลือกนักเรียน** (จากผลค้นหา): ชิป `min-h 44px` radius 14px (สไตล์เดียวกับชิปตัวกรอง) — ยังคงช่องค้นหาเดิมไว้ด้านบน
- **การ์ดหัวโปรไฟล์**: radius 22px padding 22px
  `radial-gradient(120% 120% at 100% 0%, #8A2E42 0%, #4A1624 60%, #38101A 100%)` เงา `0 20px 44px -26px rgba(56,16,26,.9)`
  - อวาตาร์ 82×82 radius 24px `rgba(255,255,255,.14)` ตัวอักษร Kanit 30px/600 ขาว
  - ชื่อ Kanit 21px/500 ขาว · meta 13px `rgba(243,214,218,.8)` (สาขา·ระดับ·รหัส)
  - pill ผลตามเกณฑ์ข้อ 8.3: `rgba(255,255,255,.14)` ตัวอักษร `#FBF4E3` 12.5px/600
  - ขวา: "คะแนนสะสม {ปีการศึกษา}" 12px + ตัวเลข Kanit 42px/600 สี `#E4BB5C` + bar สูง 6px (`rgba(255,255,255,.16)` เติม `#E4BB5C`, เทียบเพดาน 40 คะแนน)
  - ใช้ `flex-wrap` ให้พับเป็นแนวตั้งบนมือถือ
- **การ์ดประวัติ**: timeline — จุด 9px `#8A2E42` + เส้น 1.5px `#F0E4E2`
  แต่ละรายการ: ฐานความผิด 14px/600 + คะแนน `-{n}` 13px/700 `#B03A50` + บรรทัดสอง "วันที่ · บันทึกโดย {ครู}" 12px `#8A7A7E`
  (+ ปุ่ม PDF / ลบ ตามสิทธิ์เดิม)

**คงเดิมทั้งหมด:** `getRecords`, การรวมคะแนนเฉพาะปีการศึกษาปัจจุบัน, `statusForPoints`, `initialStudentId`, `deleteRecord`

### 7. UserManagement / AuditLog
ใช้สไตล์การ์ด + pill ชุดเดียวกัน:
- UserManagement: หัวการ์ด + ปุ่ม "เพิ่มผู้ใช้งาน" (`min-h 44px` พื้น `#742537` hover `#8A2E42` radius 13px) · แต่ละแถว = อวาตาร์ 38px radius 12px `#FBEEF0`/`#742537` + ชื่อ 14.5px/600 + `@username` 12px + pill บทบาท (admin = `#FBF4E3`/`#74530A`)
- AuditLog: แต่ละแถว = pill ประเภท (เพิ่ม `#E9F6F0`/`#0B5F48` · แก้ไข `#FBF4E3`/`#74530A` · ลบ `#FDECEF`/`#B03A50` · บอท `#EDF1FA`/`#324B7A` · เข้าระบบ `#F7F1EF`/`#5A484D`) + ข้อความ 13.5px + "เวลา · ผู้ใช้" 11.5px `#A29094`

---

## Interactions & Behavior

- **Navigation:** ยังใช้ `view` state ใน `App.jsx` เดิมทั้งหมด (ไม่ต้องเพิ่ม router)
- **Responsive:** breakpoint เดียวคือ `md` (768px) — ต่ำกว่านั้น = แถบเมนูล่าง + การ์ดแทนตาราง + subtitle ซ่อน + แถบบันทึก sticky
  - ใช้ `grid-cols-[repeat(auto-fit,minmax(150px,1fr))]` แทน breakpoint ในแถบสรุปและการ์ดคู่ล่าง
- **Transitions:** เข้าหน้าใหม่ fade+slide `translateY(10px) → 0`, opacity 0→1, 350ms ease
  hover ปุ่ม/ชิป 150–180ms; ปุ่มหลัก active `translateY(1px)`
- **Focus ring** (ทุก input/select): `border-color:#8A2E42` + `box-shadow:0 0 0 4px rgba(228,187,92,.3)` — ต้องมีเสมอเพื่อ accessibility
- **Loading / Error:** ใช้ `Loader2` + SweetAlert2 ชุดเดิมทั้งหมด (ธีมสีปุ่ม SweetAlert คงค่าเดิม `#8A2E42` / `#E11D48`)
- **Validation:** กฎเดิมทั้งหมด (required fields, "อื่นๆ" ต้องระบุรายละเอียด, คะแนน min 1)

## State Management
ไม่ต้องเพิ่ม state ใหม่สำหรับข้อมูล — ที่เพิ่มมีเฉพาะ UI:
- `DashboardLayout`: ลบ `mobileNavOpen` ได้ (ถ้าใช้ bottom tabs) หรือคงไว้ถ้าเลือกทำเป็น bottom sheet menu
- `Report`: เพิ่ม `filtersOpen` (boolean) สำหรับพับ/กางแถวตัวกรอง
- อื่น ๆ คงเดิมทั้งหมด

## Assets
- `public/logo-skntc.png` — ตราวิทยาลัย (ของเดิมในโปรเจกต์ ใช้ต่อ)
- ไอคอนทั้งหมด: **lucide-react** (ที่ใช้อยู่แล้ว) — ใน HTML ต้นแบบวาดเป็น inline SVG แทน แต่รูปทรงตรงกับ lucide
- ฟอนต์: Kanit + Sarabun (โปรเจกต์โหลดผ่าน `src/main.jsx` เดิม — ไม่ต้องเปลี่ยน)

## Files ในโฟลเดอร์นี้
- `RMS UI ใหม่.dc.html` — ไฟล์ต้นแบบ (เปิดในเบราว์เซอร์ได้เลย มีปุ่มสลับ คอมพิวเตอร์/มือถือ)
- `support.js` — ไฟล์ runtime ของต้นแบบ (ต้องอยู่ข้าง ๆ กันเพื่อให้ต้นแบบเปิดได้ ไม่ต้องนำเข้าโปรเจกต์จริง)
- `assets/logo-skntc.png` — โลโก้ที่ต้นแบบใช้

## Checklist ก่อนปิดงาน
- [ ] ทุกฟังก์ชัน/การเรียก API เดิมทำงานเหมือนเดิม (login, OCR, addRecord, updateRecord, deleteRecord, logout, users, auditlog, RPA stats)
- [ ] สิทธิ์ admin-only ยังซ่อน/ป้องกันหน้าเหมือนเดิมทั้ง frontend และ backend
- [ ] มือถือ 390px: ไม่มี horizontal scroll ที่ระดับหน้า, ชื่อหน้าไม่ถูกตัดคำ, ทุกเป้าแตะ ≥44px, input ≥15px
- [ ] Desktop 1280px และ 1024px: ตารางรายงานเลื่อนแนวนอนได้ ปุ่มจัดการกดได้ครบ
- [ ] Contrast ตัวหนังสือกับพื้น ≥4.5:1
- [ ] ไม่มี dependency ใหม่
