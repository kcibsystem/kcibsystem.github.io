# KCIB

ระบบจองเครื่องมือ ภาควิชาวิศวกรรมเคมี สจล. หน้าเว็บอยู่ใน `index.html`, `css/` และ `js/`

## กติกาการจอง

- ทุกหมวดจองล่วงหน้าอย่างน้อย 3 วันทำการ โดยไม่นับวันปัจจุบัน เสาร์–อาทิตย์ และวันหยุดจากชีต Holidays ตามเวลาไทย
- เวลาใช้งาน 09:00–16:00 น. ช่วงเวลาปกติเลือกได้ 1, 2 หรือ 3 ชั่วโมง
- เตาเผา เตาอบ HPLC GC เครื่องแก้ว และอุปกรณ์วิทยาศาสตร์ระบุวัน/เวลาเริ่มและสิ้นสุดเองได้
- อาจารย์ที่ปรึกษา → หัวหน้าภาคอนุมัติ → เจ้าหน้าที่รับทราบ โดยการรับทราบไม่ใช่เงื่อนไขอนุมัติ
- ผู้มีหลายบทบาทสลับได้เฉพาะบทบาทใน StaffConfig การอนุมัติและรับทราบตรวจบัญชี Google และสิทธิ์ซ้ำที่เซิร์ฟเวอร์
- รายการสถานะเดิม “รออนุมัติขั้นที่ 3” ถือว่าหัวหน้าภาคอนุมัติแล้ว และแสดงให้สตาฟรับทราบ

## ตรวจสอบ

```sh
node --test tests/booking-rules.test.cjs
```

## Apps Script

ใช้ `code.gs` เป็น backend หลัก และ `js/booking-rules.js` เป็นกติกาที่ใช้ร่วมกับหน้าเว็บ ต้อง deploy ทั้งสองไฟล์พร้อมกัน ผ่าน `.clasp.json` เดิม

`.claspignore` จำกัดไฟล์ที่ส่งไว้เป็น `code.gs`, `js/booking-rules.js` และ `appsscript.json` เท่านั้น ไฟล์เก่า `code.js` และ `code.gs.temp` ไม่ใช่ไฟล์สำหรับ deploy

บัญชีผู้ deploy ต้องเปิด Google Apps Script API ที่ https://script.google.com/home/usersettings ก่อนอัปโหลด

```sh
clasp status
clasp push
clasp deploy --deploymentId <deployment-id-เดิม> --description "Booking rules and staff acknowledgement"
```

การรับทราบครั้งแรกจะเพิ่มคอลัมน์ `StaffAcknowledgedAt` และ `StaffAcknowledgedBy` ต่อท้ายชีต ALlBooking โดยเก็บข้อมูลเดิมไว้ ชื่อบทบาทและรายชื่อสมาชิกอยู่ใน StaffConfig

หน้าเว็บ deploy ผ่าน GitHub Pages เมื่อ push เข้า `main` ธีมและบทบาทที่เลือกล่าสุดบันทึกเฉพาะในเบราว์เซอร์
