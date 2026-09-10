function generatePDF(data, refId) {
    if (!data) return "";

    // 1. 🗓️ แปลงวันที่เป็นภาษาไทย
    let thaiDate = "ไม่ระบุวันที่";
    if (data.date) {
        const dateParts = data.date.split('-'); // แยก 2026-08-03
        const months = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        const year = parseInt(dateParts[0]) + 543;
        const month = months[parseInt(dateParts[1])];
        const day = parseInt(dateParts[2]);
        thaiDate = `${day} ${month} ${year}`;
    }

    const studentId = data.studentId || "unknown";
    const docName = `บันทึกตัดคะแนน_${studentId}`;

    const folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    const template = DriveApp.getFileById(CONFIG.TEMPLATE_ID);
    const newFile = template.makeCopy(docName, folder);
    const slideDoc = SlidesApp.openById(newFile.getId());
    const slide = slideDoc.getSlides()[0];

    // 2. 📝 แทนที่ข้อมูลทั่วไป
    slide.replaceAllText("{{studentId}}", String(studentId));
    slide.replaceAllText("{{nameTitle}}", String(data.nameTitle || "")); // เติมคำนำหน้าชื่อ
    slide.replaceAllText("{{studentName}}", String(data.studentName || ""));
    slide.replaceAllText("{{major}}", String(data.fieldOfStudy || ""));   // สาขาวิชา
    slide.replaceAllText("{{year}}", String(data.year || ""));
    slide.replaceAllText("{{room}}", String(data.room || ""));
    slide.replaceAllText("{{points}}", String(data.points || ""));
    slide.replaceAllText("{{date}}", thaiDate);                           // ใช้วันที่ไทย
    slide.replaceAllText("{{teacher}}", String(data.teacherName || ""));  // ชื่อครูผู้สอน

    // 3. ✅ จัดการเครื่องหมายถูก ระดับชั้น ปวช. / ปวส.
    const isVocCert = (data.level === 'ปวช.') ? '✔' : ' ';
    const isDip = (data.level === 'ปวส.') ? '✔' : ' ';
    slide.replaceAllText("{{L1}}", isVocCert);
    slide.replaceAllText("{{L2}}", isDip);

    // 4. ✅ จัดการเครื่องหมายถูก ฐานความผิดทั้ง 14 ข้อ
    let c = Array(14).fill(' '); // สร้างอาเรย์ช่องว่าง 14 ช่อง
    let otherText = '';
    let rawOffense = data.offense || '';

    if (rawOffense === 'แต่งกายผิดระเบียบ') c[0] = '✔';
    else if (rawOffense === 'ทรงผมผิดระเบียบ/ทำสีผม') c[1] = '✔';
    else if (rawOffense === 'ทะเลาะวิวาท') c[2] = '✔';
    else if (rawOffense === 'เล่นการพนัน') c[3] = '✔';
    else if (rawOffense === 'ลักขโมย') c[4] = '✔';
    else if (rawOffense === 'ทำลายทรัพย์สินของวิทยาลัยฯ') c[5] = '✔';
    else if (rawOffense === 'หนีเรียน') c[6] = '✔';
    else if (rawOffense === 'ชู้สาว') c[7] = '✔';
    else if (rawOffense === 'สูบบุหรี่') c[8] = '✔';
    else if (rawOffense === 'พกพาอาวุธ') c[9] = '✔';
    else if (rawOffense === 'ดื่มสุราหรือของมึนเมา') c[10] = '✔';
    else if (rawOffense === 'ดูหมิ่น ก้าวร้าว ครู และบุคคลอื่น') c[11] = '✔';
    else if (rawOffense === 'บุหรี่ไฟฟ้า/กัญชา/กระท่อม/เสพยาเสพติดประเภท ๑ - ๕') c[12] = '✔';
    else if (rawOffense.startsWith('อื่นๆ')) {
        c[13] = '✔';
        otherText = rawOffense.replace('อื่นๆ:', '').trim(); // ดึงข้อความหลังคำว่า อื่นๆ: มา
    }

    // แทนที่ {{c1}} ถึง {{c14}} ด้วยเครื่องหมายถูกหรือช่องว่าง
    for (let i = 0; i < 14; i++) {
        slide.replaceAllText(`{{c${i+1}}}`, c[i]);
    }

    // 5. แทนที่ข้อความกรณีเลือกอื่นๆ (ไปโผล่ที่ {{otherText}})
    slide.replaceAllText("{{otherText}}", otherText);

    // ลบตัวแปรที่ค้างอยู่ทิ้งให้หมดเพื่อความสะอาดของเอกสาร
    slide.replaceAllText("{{offense}}", "");

    slideDoc.saveAndClose();

    const pdfBlob = newFile.getAs(MimeType.PDF);
    const pdfFile = folder.createFile(pdfBlob);
    // 🔒 เปลี่ยนจาก ANYONE_WITH_LINK (ใครก็ได้ทั่วโลกที่มีลิงก์ดูได้) เป็น
    // DOMAIN_WITH_LINK (ต้องล็อกอินด้วยบัญชี Google ของวิทยาลัยก่อนถึงจะดูได้)
    // เพราะ PDF นี้มีข้อมูลส่วนบุคคลของนักเรียนอยู่ (ชื่อ-สกุล รหัสนักเรียน
    // รายละเอียดความผิด) ไม่ควรเปิดให้ใครก็ได้ในโลกดูได้แค่มีลิงก์
    pdfFile.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);

    newFile.setTrashed(true);

    return pdfFile.getUrl();
}
