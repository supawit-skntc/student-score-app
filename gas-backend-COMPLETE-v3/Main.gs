function doPost(e) {
  let action = null; // ประกาศไว้นอก try เพื่อให้ catch ด้านล่างอ้างถึงได้ (ใส่ลง log แจ้งเตือนได้ว่า error เกิดตอนเรียก action ไหน)
  // ล้างค่าที่จำไว้ของ session/rate limit ก่อนทุกคำขอ (ดูคำอธิบายที่ REQUEST_MEMO_
  // ใน Utils.gs) กันค่าค้างข้ามคำขอถ้า Apps Script นำ runtime เดิมกลับมาใช้
  resetRequestMemo_();
  try {
    const requestBody = JSON.parse(e.postData.contents);
    action = requestBody.action;
    const token = requestBody.token;
    let response = {};

    if (action !== "login") {
      requireSession(token);
    }

    switch (action) {
      case "login":
        response = handleLogin(requestBody.username, requestBody.password);
        break;
      case "logout":
        response = revokeSession(token);
        break;
      case "addRecord":
        response = processRecordTransaction(token, requestBody.data);
        break;
      case "generateRecordPdf":
        response = generateRecordPdf(token, requestBody.id);
        break;
      case "getRecords":
        response = getRecords();
        break;
      case "getMyRecords":
        response = getMyRecords(token);
        break;
      case "updateRecord":
        response = updateRecord(token, requestBody.data);
        break;
      case "ocrScan":
        response = scanStudentCard(token, requestBody.image);
        break;
      case "getRpaStats":
        response = getRpaStats(token);
        break;
      case "getOffenses":
        response = getOffenses(token);
        break;
      case "getProbationStatus":
        response = getProbationStatus(token);
        break;
      case "addProbationRecord":
        response = addProbationRecord(token, requestBody.data);
        break;
      case "updateProbationRecord":
        response = updateProbationRecord(token, requestBody.data);
        break;
      case "deleteProbationRecord":
        response = deleteProbationRecord(token, requestBody.id);
        break;

      // ===== ผู้ดูแลระบบเท่านั้น =====
      case "getUsers":
        response = getUsersList(token);
        break;
      case "createUser":
        response = createUser(token, requestBody.data);
        break;
      case "updateUser":
        response = updateUser(token, requestBody.data);
        break;
      case "deleteUser":
        response = deleteUser(token, requestBody.username);
        break;
      case "deleteRecord":
        response = deleteRecord(token, requestBody.id);
        break;
      case "getAuditLogs":
        response = getAuditLogs(token);
        break;
      case "getRoleTiers":
        response = getRoleTiers(token);
        break;

      // ===== สำหรับ RPA Bot (Python) — เรียกผ่าน HTTP API นี้แทน Google Sheets
      // API โดยตรง เพราะองค์กรบล็อกการสร้าง Service Account Key ไว้ บอทจึง
      // "login" เป็นผู้ใช้งานปกติ 1 บัญชี (สร้างผ่านหน้าจัดการผู้ใช้งาน) แล้วใช้
      // token เดียวกับที่ระบบอื่นใช้อยู่แล้ว ไม่ต้องตั้งค่า Google Cloud เพิ่มเลย =====
      case "getSyncQueue":
        response = getSyncQueue();
        break;
      case "updateSyncStatus":
        response = updateSyncStatus(requestBody.data);
        break;
      case "logRpaEvent":
        response = logRpaEvent(requestBody.data);
        break;
      case "reportBotFailure":
        response = reportBotFailure(token, requestBody.data && requestBody.data.message);
        break;

      default:
        response = { status: "error", message: "Invalid Action" };
    }

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    notifyAdminOfError_(err, { action: action });
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString().replace('Error: ', '')
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
