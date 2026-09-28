// ทดสอบระบบหลังบ้านทั้งชุด (ทุกไฟล์ .gs โหลดรวมกัน + เรียกผ่าน doPost จริง) ด้วย mock ของ Apps Script
// ใช้: npm run test:backend   (หรือ node gas-backend-COMPLETE-v3/tests/backend.test.cjs [โฟลเดอร์ซอร์ส])
// ไม่ต้องต่อ Google — จำลอง CacheService/Sheets/Lock ในหน่วยความจำ แล้วเรียกผ่าน doPost จริงทุกไฟล์รวมกัน
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.argv[2] || path.join(__dirname, '..'); // โฟลเดอร์ .gs (ระบุโฟลเดอร์อื่นเป็นอาร์กิวเมนต์ได้ เช่นเทียบกับรุ่นเก่า)
const FILES = ['Config.gs', 'Utils.gs', 'Service_Auth.gs', 'Service_Users.gs', 'Service_Records.gs', 'Service_PDF.gs',
  'Service_RpaBot.gs', 'Service_Probation.gs', 'Service_OCR.gs', 'Service_Ops.gs', 'Main.gs'];
const source = FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

// ---------------------------------------------------------------- mocks
const counters = {};
const bump = (k) => { counters[k] = (counters[k] || 0) + 1; };
const resetCounters = () => Object.keys(counters).forEach((k) => delete counters[k]);

function makeEnv() {
  const store = {};
  const cache = {
    get: (k) => { bump('cache.get'); return k in store ? store[k] : null; },
    getAll: (ks) => { bump('cache.getAll'); const o = {}; ks.forEach((k) => { if (k in store) o[k] = store[k]; }); return o; },
    put: (k, v) => { bump('cache.put'); store[k] = String(v); },
    putAll: (o) => { bump('cache.putAll'); Object.keys(o).forEach((k) => { store[k] = String(o[k]); }); },
    remove: (k) => { bump('cache.remove'); delete store[k]; },
  };
  const makeSheet = (name, rows, width) => {
    const s = {
      name, rows, width,
      getLastRow: () => rows.length,
      getLastColumn: () => s.width,
      getMaxColumns: () => s.width,
      insertColumnsAfter: (_after, n) => { s.width += n; },
      getDataRange: () => { bump('sheet.getDataRange'); return { getValues: () => rows.map((r) => r.slice()) }; },
      getRange: (r, c, nr = 1, nc = 1) => {
        bump('sheet.getRange');
        if (c + nc - 1 > s.width) throw new Error('Range beyond columns');
        return {
          getValues: () => { bump('range.getValues'); const out = []; for (let i = 0; i < nr; i++) { const row = rows[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); out.push(o); } return out; },
          getValue: () => { bump('range.getValue'); const row = rows[r - 1] || []; return row[c - 1] === undefined ? '' : row[c - 1]; },
          setValue: (v) => { bump('range.setValue'); while (rows[r - 1].length < c) rows[r - 1].push(''); rows[r - 1][c - 1] = v; },
          setValues: (vs) => { bump('range.setValues'); vs.forEach((vr, i) => vr.forEach((v, j) => { rows[r - 1 + i][c - 1 + j] = v; })); },
          setFontWeight: () => {},
        };
      },
      appendRow: (a) => { bump('sheet.appendRow'); const row = a.slice(); while (row.length < s.width) row.push(''); if (row.length > s.width) s.width = row.length; rows.push(row); },
      deleteRow: (i) => { bump('sheet.deleteRow'); rows.splice(i - 1, 1); },
    };
    return s;
  };
  const sheets = {};
  const ss = {
    getId: () => 'SSID',
    getSheetByName: (n) => { bump('ss.getSheetByName'); return sheets[n] || null; },
    insertSheet: (n) => { sheets[n] = makeSheet(n, [], 10); return sheets[n]; },
  };
  const drive = { trashed: [], files: {} };
  const globals = {
    CacheService: { getScriptCache: () => cache },
    LockService: { getScriptLock: () => ({ waitLock: () => { bump('lock.wait'); }, releaseLock: () => { bump('lock.release'); } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, input) => Array.from(crypto.createHash('sha256').update(input).digest()).map((b) => (b > 127 ? b - 256 : b)),
      DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
      formatDate: () => '20260101_000000',
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => { bump('SpreadsheetApp.getActive'); return ss; }, openById: () => { bump('SpreadsheetApp.openById'); return ss; } },
    DriveApp: { getFileById: (id) => ({ setTrashed: () => { drive.trashed.push(id); } }) },
    MailApp: { sendEmail: () => { bump('mail'); } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    Session: { getScriptTimeZone: () => 'Asia/Bangkok' },
    MimeType: { CSV: 'text/csv', PDF: 'application/pdf' },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }),
    },
    console: { error: () => {}, log: () => {} },
    Logger: { log: () => {} },
  };
  return { cache, store, sheets, makeSheet, globals, drive };
}

function build(env, extraStubs = '') {
  const names = Object.keys(env.globals);
  const body = source + `
;function generatePDF(data, refId) { pdfCalls.push({ data, refId }); return 'https://drive.example/pdf_' + refId; }
` + extraStubs + `
const __names = ['doPost','processRecordTransaction','updateRecord','updateSyncStatus','getSyncQueue','generatePdfForRow_','processPendingPdfs_','createUser','updateUser','deleteUser','addProbationRecord','sheetToCsv_','normalizeRecordInput_','findOffenseEntry_','resetRequestMemo_','getSession','createSession','requireDisciplineStaff_','hashPassword','isValidIsoDate_','readActiveRecordRows_'];
const __out = {}; __names.forEach((n) => { try { __out[n] = eval(n); } catch (e) { /* ไม่มีในซอร์สรุ่นเก่า */ } });
return __out;`;
  const pdfCalls = [];
  const fn = new Function(...names, 'pdfCalls', body);
  const api = fn(...names.map((n) => env.globals[n]), pdfCalls);
  api.pdfCalls = pdfCalls;
  return api;
}

// ---------------------------------------------------------------- fixtures
const REC_W = 20;
const recHeader = ['id', 'ts', 'date', 'sid', 'title', 'name', 'major', 'level', 'year', 'room', 'offense', 'points', 'teacher', 'pdf', 'status', 'syncedAt', 'note', 'deletedAt', 'createdBy', 'clientReqId'];
function fixture() {
  const env = makeEnv();
  const salt = 'salt1';
  const users = [['Username', 'Password_Hash', 'Full_Name', 'Role', 'Salt', 'Email']];
  const api0 = { hp: (p, s) => Array.from(crypto.createHash('sha256').update(p + s).digest()).map((b) => b.toString(16).padStart(2, '0')).join('') };
  [['admin', 'AdminPass1', 'นายผู้ดูแล ระบบ', 'ผู้ดูแลระบบ'], ['teacher1', 'TeacherPass1', 'นางสาวครู หนึ่ง', 'ครูผู้สอน'],
   ['teacher2', 'TeacherPass2', 'นายครู สอง', 'ครูผู้สอน'], ['advisor', 'AdvisorPass1', 'นางครูปกครอง ดี', 'ครูปกครอง'],
   ['rpa-bot', 'BotPass1234', 'rpa-bot', 'ผู้ดูแลระบบ']].forEach(([u, p, n, r]) => users.push([u, api0.hp(p, salt), n, r, salt, '']));
  env.sheets.Users = env.makeSheet('Users', users, 6);
  env.sheets.Records = env.makeSheet('Records', [recHeader.slice()], REC_W);
  env.sheets.Audit_Logs = env.makeSheet('Audit_Logs', [['t', 'u', 'a', 'x', 's']], 5);
  env.sheets.Probation = env.makeSheet('Probation', [['ts', 'sid', 'name', 'date', 'by', 'note', 'id']], 7);
  return env;
}

let pass = 0, fail = 0;
const t = (name, cond, extra = '') => { if (cond) pass++; else fail++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const call = (api, body) => { api.resetRequestMemo_(); return JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).text); };
const login = (api, u, p) => call(api, { action: 'login', username: u, password: p });
const validRecord = (over = {}) => Object.assign({
  date: new Date().toISOString().slice(0, 10), studentId: '69219000001', nameTitle: 'นาย', studentName: 'ทดสอบ ตัวอย่าง',
  fieldOfStudy: 'ช่างยนต์', level: 'ปวช.', year: '1', room: '1', offense: 'หนีเรียน', otherOffense: '', points: '10',
  teacherName: 'ปลอมชื่อ', clientRequestId: crypto.randomUUID(),
}, over);
const auditsOf = (env) => env.sheets.Audit_Logs.rows.slice(1).map((r) => r[2] + ':' + r[4]);

module.exports = { fixture, build, login, call, validRecord, auditsOf, counters, resetCounters, t, results: () => ({ pass, fail }), makeEnv, recHeader };

if (require.main === module) {
  const env = fixture();
  const api = build(env);
  const A = login(api, 'admin', 'AdminPass1').token;
  const T1 = login(api, 'teacher1', 'TeacherPass1').token;
  const T2 = login(api, 'teacher2', 'TeacherPass2').token;
  const ADV = login(api, 'advisor', 'AdvisorPass1').token;
  const BOT = login(api, 'rpa-bot', 'BotPass1234').token;
  t('login works end-to-end', !!A && !!T1 && !!T2 && !!ADV && !!BOT);
  t('login wrong password rejected', login(api, 'admin', 'nope').status === 'error');

  // ---- A. เพิ่มรายการปกติ
  let r = call(api, { action: 'addRecord', token: T1, data: validRecord() });
  const rows = env.sheets.Records.rows;
  t('addRecord valid -> success', r.status === 'success' && !!r.id, JSON.stringify(r).slice(0, 80));
  t('addRecord: row appended once', rows.length === 2);
  t('addRecord: teacherName forced from session (not client)', rows[1][12] === 'นางสาวครู หนึ่ง', rows[1][12]);
  t('addRecord: createdBy = session user', rows[1][18] === 'teacher1');
  t('addRecord: points stored as number', rows[1][11] === 10);
  t('addRecord: status pending, pdf empty, not deleted', rows[1][14] === 'pending' && rows[1][13] === '' && rows[1][17] === '');

  // ---- B. ข้อมูลไม่ถูกต้อง ต้องถูกปฏิเสธและไม่เขียนแถว
  const bad = [
    ['formula in studentId', { studentId: '=IMPORTXML("http://x","//a")' }],
    ['bad date text', { date: 'yesterday' }], ['impossible date', { date: '2026-02-31' }],
    ['buddhist-era year date', { date: '2569-09-24' }], ['far future date', { date: '2099-01-01' }],
    ['bad level', { level: 'ม.6' }], ['bad year', { year: '9' }],
    ['points 0', { points: '0' }], ['points 101', { points: '101' }], ['points text', { points: 'abc' }], ['points decimal', { points: '2.5' }],
    ['unknown offense', { offense: 'ทำอะไรก็ได้' }], ['other without detail', { offense: 'อื่นๆ:' }],
    ['empty name', { studentName: '  ' }], ['studentId too short', { studentId: '12' }],
  ];
  const before = rows.length;
  bad.forEach(([label, over]) => {
    const res = call(api, { action: 'addRecord', token: T1, data: validRecord(over) });
    t('reject: ' + label, res.status === 'error', res.message || '');
  });
  t('rejected inputs wrote no rows', rows.length === before);
  t('rejections recorded in audit log', auditsOf(env).filter((a) => /REJECTED_INVALID_INPUT/.test(a)).length === bad.length);

  {
    const neg = call(api, { action: 'addRecord', token: T1, data: validRecord({ studentId: '69219000031', points: '-5', offense: 'แต่งกายผิดระเบียบ' }) });
    t('legacy negative points "-5" accepted and stored as 5', neg.status === 'success' && rows[rows.length - 1][11] === 5);
  }
  // ---- C. กรองสูตรในช่องข้อความ
  r = call(api, { action: 'addRecord', token: T1, data: validRecord({ studentName: '=HYPERLINK("http://evil")', room: '@x', nameTitle: '+1', fieldOfStudy: '-2+3' }) });
  const last = rows[rows.length - 1];
  t('formula text neutralised with apostrophe', r.status === 'success' && last[5].startsWith("'=") && last[9].startsWith("'@") && last[4].startsWith("'+") && last[6].startsWith("'-"), JSON.stringify([last[4], last[5], last[6], last[9]]));

  // ---- D. กันบันทึกซ้ำ (idempotency) รวมกรณีแคชเก่า
  const dupBody = validRecord({ studentId: '69219000009', clientRequestId: 'client-req-0001' });
  const n0 = rows.length;
  const first = call(api, { action: 'addRecord', token: T1, data: dupBody });
  const second = call(api, { action: 'addRecord', token: T1, data: dupBody });
  t('same clientRequestId twice -> one row', rows.length === n0 + 1 && second.status === 'success' && second.id === first.id);
  // จำลองแคชเก่า: แคชเก็บภาพก่อนแถวที่เพิ่ง เขียน แล้วส่งรหัสเดิมซ้ำ (คำขอลองใหม่ที่ชนกัน)
  const stale = call(api, { action: 'addRecord', token: T1, data: validRecord({ studentId: '69219000010', clientRequestId: 'client-req-0002' }) });
  const staleRowsSnapshot = JSON.stringify(rows.slice(1, rows.length - 1)); // ก่อนแถวล่าสุด
  api.resetRequestMemo_();
  // ใส่แคชแบบเก่า (ไม่มีแถวล่าสุด) ทับ
  env.store['records_raw_rows_v1'] = '00000000|1|' + staleRowsSnapshot;
  const retry = call(api, { action: 'addRecord', token: T1, data: validRecord({ studentId: '69219000010', clientRequestId: 'client-req-0002' }) });
  t('stale cache + same clientRequestId -> still no duplicate row', retry.status === 'success' && retry.id === stale.id && rows.filter((x) => x[19] === 'client-req-0002').length === 1);

  // ---- E. กฎห้ามซ้ำวันเดียวกัน
  const dayBody = (o) => validRecord(Object.assign({ studentId: '69219000020', clientRequestId: crypto.randomUUID() }, o));
  const d1 = call(api, { action: 'addRecord', token: T1, data: dayBody({ offense: 'แต่งกายผิดระเบียบ', points: '5' }) });
  const d2 = call(api, { action: 'addRecord', token: T2, data: dayBody({ offense: 'แต่งกายผิดระเบียบ', points: '5' }) });
  t('same-day repeat of dress code blocked', d1.status === 'success' && d2.status === 'error');
  const d3 = call(api, { action: 'addRecord', token: T1, data: dayBody({ offense: 'หนีเรียน' }) });
  const d4 = call(api, { action: 'addRecord', token: T1, data: dayBody({ offense: 'หนีเรียน' }) });
  t('same-day repeat of a repeatable offense allowed', d3.status === 'success' && d4.status === 'success');

  // ---- F. แก้ไขรายการ
  const recId = first.id;
  const edit = (tok, over = {}) => call(api, { action: 'updateRecord', token: tok, data: Object.assign({}, validRecord({ studentId: '69219000009', studentName: 'แก้ไขแล้ว' }), { id: recId }, over) });
  const rowOf = () => rows.find((x) => x[0] === recId);
  t('non-owner teacher denied', edit(T2).status === 'error' && /ไม่มีสิทธิ์/.test(edit(T2).message));
  resetCounters();
  const ok = edit(T1);
  const c = Object.assign({}, counters);
  t('owner can edit', ok.status === 'success' && rowOf()[5] === 'แก้ไขแล้ว');
  t('edit: teacherName kept (original recorder)', rowOf()[12] === 'นางสาวครู หนึ่ง');
  t('edit: pdf cleared + status pending for regeneration', rowOf()[13] === '' && rowOf()[14] === 'pending');
  t('edit: no synchronous PDF generation', api.pdfCalls.length === 0);
  t('edit: ONE setValues, zero setValue', c['range.setValues'] === 1 && !c['range.setValue'], JSON.stringify(c));
  t('advisor (full-visibility) can edit anyone', edit(ADV, { studentName: 'โดยครูปกครอง' }).status === 'success');
  t('admin can edit anyone', edit(A, { studentName: 'โดยแอดมิน' }).status === 'success');
  t('edit rejects invalid input', edit(T1, { points: '9999' }).status === 'error');
  // ลบแล้วห้ามแก้
  const delRes = call(api, { action: 'deleteRecord', token: A, id: recId });
  t('delete (admin) ok', delRes.status === 'success');
  t('deleted record cannot be edited', edit(A).status === 'error');
  t('teacher cannot delete', call(api, { action: 'deleteRecord', token: T1, id: recId }).status === 'error');

  {
    // ลบรายการต้องเร็ว: ไม่อ่านทั้งชีต
    const e3 = fixture(); const a3 = build(e3);
    const A3 = login(a3, 'admin', 'AdminPass1').token;
    const ids3 = [];
    for (let i = 0; i < 30; i++) ids3.push(call(a3, { action: 'addRecord', token: A3, data: validRecord({ studentId: '6921900' + (2000 + i), clientRequestId: crypto.randomUUID() }) }).id);
    resetCounters();
    const dr = call(a3, { action: 'deleteRecord', token: A3, id: ids3[29] });
    t('deleteRecord reads only column A (never the whole sheet)', dr.status === 'success' && !counters['sheet.getDataRange'], JSON.stringify(counters));
    t('deleted row is hidden from getRecords', !call(a3, { action: 'getRecords', token: A3 }).data.some((x) => x.id === ids3[29]));
  }

  // ---- G. บอท
  const pendId = rows.find((x) => x[14] === 'pending' && !x[17])[0];
  resetCounters();
  const st = call(api, { action: 'updateSyncStatus', token: BOT, data: { id: pendId, status: 'synced', note: '=cmd' } });
  t('updateSyncStatus ok in ONE write', st.status === 'success' && counters['range.setValues'] === 1 && !counters['range.setValue'], JSON.stringify(counters));
  const sr = rows.find((x) => x[0] === pendId);
  t('sync status/time/note stored', sr[14] === 'synced' && !!sr[15] && sr[16] === "'=cmd");
  const q = call(api, { action: 'getSyncQueue', token: BOT });
  t('getSyncQueue returns ISO dates & only pending', q.status === 'success' && q.data.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)) && q.data.length > 0);
  t('teacher cannot use bot endpoints', call(api, { action: 'getSyncQueue', token: T1 }).status === 'error');

  // ---- H. ผู้ใช้
  const cu = (o) => call(api, { action: 'createUser', token: A, data: Object.assign({ username: 'newuser', fullName: 'ผู้ใช้ ใหม่', role: 'ครูผู้สอน', password: 'GoodPass123', email: '', majors: ['การบัญชี'] }, o) });
  t('createUser valid', cu({}).status === 'success');
  t('createUser rejects empty majors for a normal-tier role (ครูผู้สอน, mandatory 28/9/69)', cu({ username: 'nomajor', majors: [] }).status === 'error');
  t('createUser rejects omitted majors entirely for a normal-tier role', cu({ username: 'nomajor2', majors: undefined }).status === 'error');
  t('createUser allows empty majors for a full-tier role (majors n/a for that tier)',
    call(api, { action: 'createUser', token: A, data: { username: 'fulltier1', fullName: 'x', role: 'ครูปกครอง', password: 'GoodPass123', majors: [] } }).status === 'success');
  ['=cmd|calc', '+1', '@x', 'a b', 'x', 'ab$'].forEach((u) => t('createUser rejects username ' + JSON.stringify(u), cu({ username: u }).status === 'error'));
  ['rpa-bot2', 'Aemmika', 'pitchayamat', 'teacher.3', 'ครูสมชาย'].forEach((u) => t('createUser accepts username ' + u, cu({ username: u }).status === 'success'));
  t('createUser rejects whitespace-only password', cu({ username: 'wsuser', password: '        ' }).status === 'error');
  t('createUser rejects short password', cu({ username: 'shortpw', password: 'abc12' }).status === 'error');
  const uu = (o) => call(api, { action: 'updateUser', token: A, data: Object.assign({ username: 'teacher2', fullName: 'นายครู สอง', role: 'ครูผู้สอน' }, o) });
  t('updateUser rejects whitespace-only password', uu({ password: '         ' }).status === 'error');
  t('admin cannot demote self', call(api, { action: 'updateUser', token: A, data: { username: 'admin', fullName: 'x', role: 'ครูผู้สอน' } }).status === 'error');
  resetCounters();
  const upd = uu({ fullName: 'ชื่อใหม่', role: 'ครูปกครอง' });
  t('updateUser name+role in one write', upd.status === 'success' && counters['range.setValues'] === 1 && !counters['range.setValue'], JSON.stringify(counters));
  t('role change revokes teacher2 session', call(api, { action: 'getMyRecords', token: T2 }).status === 'error');

  // ---- I. ทัณฑ์บน
  const pr = (o) => call(api, { action: 'addProbationRecord', token: ADV, data: Object.assign({ studentId: '69219000009', studentName: 'นายทดสอบ', date: '2026-09-01', note: 'ok' }, o) });
  t('probation valid', pr({}).status === 'success');
  t('probation rejects formula studentId', pr({ studentId: '=1+1' }).status === 'error');
  t('probation rejects bad date', pr({ date: '31/12/2569' }).status === 'error');
  t('probation: teacher denied', call(api, { action: 'addProbationRecord', token: T1, data: { studentId: '69219000009', studentName: 'x', date: '2026-09-01' } }).status === 'error');

  // ---- J. PDF
  const pdfEnv = fixture(); const pdfApi = build(pdfEnv);
  const PA = login(pdfApi, 'admin', 'AdminPass1').token;
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(call(pdfApi, { action: 'addRecord', token: PA, data: validRecord({ studentId: '6921900' + (1000 + i), clientRequestId: crypto.randomUUID() }) }).id);
  pdfEnv.sheets.Records.rows[2][13] = 'https://drive/already'; // แถวที่ 2 มี PDF แล้ว
  pdfEnv.sheets.Records.rows[3][17] = '2026-01-01T00:00:00Z'; // แถวที่ 3 ถูกลบ
  resetCounters();
  pdfApi.processPendingPdfs_();
  t('background PDF: processes only pending, non-deleted rows', pdfApi.pdfCalls.length === 4, 'calls=' + pdfApi.pdfCalls.length);
  t('background PDF: never reads whole sheet', !counters['sheet.getDataRange'], JSON.stringify(counters));
  t('background PDF: urls written', pdfEnv.sheets.Records.rows.filter((x, i) => i > 0 && !x[17]).every((x) => x[13]));
  pdfApi.pdfCalls.length = 0;
  pdfEnv.store['pdf_generating_' + ids[0]] = '1';
  pdfEnv.sheets.Records.rows[1][13] = '';
  pdfApi.resetRequestMemo_();
  const busy = pdfApi.generatePdfForRow_(pdfEnv.sheets.Records, 2, ids[0]);
  t('PDF in-progress flag prevents duplicate generation', busy.status === 'pending' && pdfApi.pdfCalls.length === 0);

  // ---- K. CSV สำรอง
  const csvSheet = { getDataRange: () => ({ getValues: () => [['a', '=SUM(1)', '-5', '+cmd', '@x', 'ปกติ', '-abc', '12.5', 'ตัว"อัญ']] }) };
  const csv = pdfApi.sheetToCsv_(csvSheet);
  t('backup CSV neutralises formulas but keeps numbers', csv === `"a","'=SUM(1)","-5","'+cmd","'@x","ปกติ","'-abc","12.5","ตัว""อัญ"`, csv);


  // ---- L. 1 บัญชี ใช้พร้อมกันได้ทีละ 1 เครื่อง (คำขอผู้ใช้ 28/9/69) — ล็อกอินซ้ำต้องเตะเซสชันเก่าทิ้งทันที
  {
    const e6 = fixture(); const a6 = build(e6);
    const first = login(a6, 'teacher1', 'TeacherPass1').token;
    t('single-session: first login works', call(a6, { action: 'getMyRecords', token: first }).status === 'success');
    const second = login(a6, 'teacher1', 'TeacherPass1').token;
    t('single-session: second login (same account, another device) succeeds with a different token', !!second && second !== first);
    t('single-session: the first token is revoked immediately (no grace window)', call(a6, { action: 'getMyRecords', token: first }).status === 'error');
    t('single-session: the second (newest) token still works right after revoking the first', call(a6, { action: 'getMyRecords', token: second }).status === 'success');
    const otherUserToken = login(a6, 'teacher2', 'TeacherPass2').token;
    t('single-session: logging in as a different account does not revoke an unrelated session', call(a6, { action: 'getMyRecords', token: second }).status === 'success');
    t('single-session: the other account\'s own new session also works', call(a6, { action: 'getMyRecords', token: otherUserToken }).status === 'success');
  }

  // ---- L2. เพดาน rate limit คีย์ด้วยชื่อผู้ใช้ ไม่ใช่ token — ล็อกอินใหม่ต้องไม่รีเซ็ตโควตา (ตรวจพบระหว่างตรวจสอบระบบ 28/9/69)
  {
    const e7 = fixture(); const a7 = build(e7);
    let tok = login(a7, 'teacher1', 'TeacherPass1').token;
    let lastRes;
    for (let i = 0; i < 120; i++) lastRes = call(a7, { action: 'getMyRecords', token: tok });
    t('rate limit: 120 requests within the window all succeed', lastRes.status === 'success');
    const over = call(a7, { action: 'getMyRecords', token: tok });
    t('rate limit: the 121st request in the same window is rejected', over.status === 'error' && /ถี่เกินไป/.test(over.message));
    tok = login(a7, 'teacher1', 'TeacherPass1').token; // token ใหม่ (เตะ token เดิมทิ้งด้วย — ดูบล็อก single-session ด้านบน)
    const afterRelogin = call(a7, { action: 'getMyRecords', token: tok });
    t('rate limit: re-logging in for a fresh token does NOT reset the quota (was exploitable before this fix)',
      afterRelogin.status === 'error' && /ถี่เกินไป/.test(afterRelogin.message));
  }

  // ---- L3. generateRecordPdf ต้องเช็กสิทธิ์มองเห็นก่อนเสมอ (ช่องโหว่ที่พบระหว่างตรวจสอบระบบ 28/9/69 — เดิมไม่เช็กเลย)
  {
    const e8 = fixture(); const a8 = build(e8);
    const A8 = login(a8, 'admin', 'AdminPass1').token;
    const T1z = login(a8, 'teacher1', 'TeacherPass1').token;
    const T2z = login(a8, 'teacher2', 'TeacherPass2').token;
    const rec = call(a8, { action: 'addRecord', token: T1z, data: validRecord({ studentId: '69219000301', fieldOfStudy: 'การบัญชี', clientRequestId: crypto.randomUUID() }) });
    t('setup: record created', rec.status === 'success');
    const deniedForOther = call(a8, { action: 'generateRecordPdf', token: T2z, id: rec.id });
    t('generateRecordPdf: unrelated teacher (no majors, not the owner) is denied', deniedForOther.status === 'error' && /สิทธิ์/.test(deniedForOther.message));
    const okForOwner = call(a8, { action: 'generateRecordPdf', token: T1z, id: rec.id });
    t('generateRecordPdf: the owning teacher can generate it', okForOwner.status === 'success');
    // ล้าง URL ที่เพิ่งเขียนไว้ (เช็ก idempotent เดิมจะคืน "มีอยู่แล้ว" ทันทีถ้าไม่ล้างก่อน) เพื่อทดสอบแอดมินแยกรอบ
    e8.sheets.Records.rows[e8.sheets.Records.rows.length - 1][13] = '';
    const okForAdmin = call(a8, { action: 'generateRecordPdf', token: A8, id: rec.id });
    t('generateRecordPdf: admin (full visibility) can generate any record', okForAdmin.status === 'success');
  }

  // ---- M. อัปเกรดแฮชบัญชีเก่า (ไม่มี salt) ตอนเข้าสู่ระบบ
  {
    const e2 = fixture(); const a2 = build(e2);
    const legacyHash = crypto.createHash('sha256').update('LegacyPass99').digest('hex');
    e2.sheets.Users.rows.push(['legacy', legacyHash, 'บัญชีเก่า', 'ครูผู้สอน', '', '']);
    const bad = login(a2, 'legacy', 'wrong');
    const rowNow = () => e2.sheets.Users.rows.find((x) => x[0] === 'legacy');
    t('legacy login with wrong password does NOT upgrade', bad.status === 'error' && rowNow()[4] === '' && rowNow()[1] === legacyHash);
    const good = login(a2, 'legacy', 'LegacyPass99');
    t('legacy login succeeds', good.status === 'success' && good.user.role === 'ครูผู้สอน');
    t('legacy hash upgraded to salted form', rowNow()[4] !== '' && rowNow()[1] !== legacyHash && rowNow()[2] === 'บัญชีเก่า' && rowNow()[3] === 'ครูผู้สอน', JSON.stringify(rowNow()));
    t('after upgrade the same password still works', login(a2, 'legacy', 'LegacyPass99').status === 'success');
    t('after upgrade a wrong password still fails', login(a2, 'legacy', 'LegacyPass98').status === 'error');
    t('upgrade recorded in audit log', auditsOf(e2).some((x) => /UPGRADE_PASSWORD_HASH/.test(x)));
  }


  // ---- N. ขอบเขตการเห็นรายการ (ครูเห็นของตัวเอง + นักเรียนในสาขาที่รับผิดชอบ)
  {
    const e4 = fixture(); const a4 = build(e4);
    const A4 = login(a4, 'admin', 'AdminPass1').token;
    const DBD = 'เทคโนโลยีธุรกิจดิจิทัล', MECH = 'ช่างยนต์';
    // ครู 3 คน: ครู 1 ไม่มีสาขา, ครู 2 ดูแล DBD, ครู 3 ดูแล DBD+ช่างยนต์ (ตั้งผ่านหน้าจัดการผู้ใช้จริง)
    t('setup: Users sheet starts WITHOUT Majors column', e4.sheets.Users.width === 6);
    const spin = (ms) => { const s0 = Date.now(); while (Date.now() - s0 < ms); }; // token ที่ออกในมิลลิวินาทีเดียวกับการยกเลิกสิทธิ์ ถือว่าถูกยกเลิก (ตั้งใจ) — รอให้เลยไปก่อน
    const upd = (username, majors) => { const r0 = call(a4, { action: 'updateUser', token: A4, data: { username, fullName: e4.sheets.Users.rows.find((r) => r[0] === username)[2], role: 'ครูผู้สอน', majors } }); spin(3); return r0; };
    t('updateUser rejects unknown major', upd('teacher1', ['สาขาที่ไม่มีจริง']).status === 'error');
    t('updateUser sets majors (adds column G automatically)', upd('teacher2', [DBD]).status === 'success' && e4.sheets.Users.width === 7 && e4.sheets.Users.rows[0][6] === 'Majors');
    t('updateUser rejects clearing majors to empty for a normal-tier role (mandatory 28/9/69)', upd('teacher1', []).status === 'error');
    const tt = (u, p) => login(a4, u, p);
    // เพิ่มรายการ: ครู1 บันทึก DBD(ของ s1), ช่างยนต์(ของ s2); ครู2 บันทึก DBD (s3); แอดมินบันทึก ช่างยนต์ (s4)
    const T1x = tt('teacher1', 'TeacherPass1').token, T2x = tt('teacher2', 'TeacherPass2').token;
    const add = (tok, sid, major) => call(a4, { action: 'addRecord', token: tok, data: validRecord({ studentId: sid, fieldOfStudy: major, clientRequestId: crypto.randomUUID() }) });
    add(T1x, '69219000101', DBD); add(T1x, '69219000102', MECH); add(T2x, '69219000103', DBD); add(A4, '69219000104', MECH);
    const ids = (tok) => call(a4, { action: 'getRecords', token: tok }).data.map((x) => x.studentId).sort();
    t('teacher without majors sees only own records', JSON.stringify(ids(T1x)) === JSON.stringify(['69219000101', '69219000102']), JSON.stringify(ids(T1x)));
    t('teacher with major DBD sees own + all DBD students (not other majors)', JSON.stringify(ids(T2x)) === JSON.stringify(['69219000101', '69219000103']), JSON.stringify(ids(T2x)));
    t('admin sees all', ids(A4).length === 4);
    const advTok = tt('advisor', 'AdvisorPass1').token;
    t('advisor (full-visibility) sees all', ids(advTok).length === 4);
    t('getMyRecords == getRecords scope', JSON.stringify(call(a4, { action: 'getMyRecords', token: T2x }).data.map((x) => x.id)) === JSON.stringify(call(a4, { action: 'getRecords', token: T2x }).data.map((x) => x.id)));
    const view = call(a4, { action: 'getRecords', token: T2x }).data;
    t('canEdit true only for own rows', view.find((x) => x.studentId === '69219000103').canEdit === true && view.find((x) => x.studentId === '69219000101').canEdit === false);
    const others = view.find((x) => x.studentId === '69219000101');
    const edit2 = call(a4, { action: 'updateRecord', token: T2x, data: Object.assign(validRecord({ studentId: '69219000101', fieldOfStudy: DBD }), { id: others.id }) });
    t('seeing a colleague\'s record (via major) does NOT allow editing it', edit2.status === 'error' && /ไม่มีสิทธิ์/.test(edit2.message));
    // ทัณฑ์บน: ครูเห็นเฉพาะของนักเรียนที่ตัวเองเห็นรายการ
    const advPr = (sid) => call(a4, { action: 'addProbationRecord', token: advTok, data: { studentId: sid, studentName: 'นักเรียน', date: '2026-09-01', note: 'ลับ' } });
    advPr('69219000101'); advPr('69219000104');
    const prT2 = call(a4, { action: 'getRecords', token: T2x }).probationByStudent;
    t('probation map filtered to visible students', Object.keys(prT2).join() === '69219000101', Object.keys(prT2).join());
    t('getProbationStatus filtered for teacher', Object.keys(call(a4, { action: 'getProbationStatus', token: T2x }).data).join() === '69219000101');
    t('getProbationStatus unfiltered for admin', Object.keys(call(a4, { action: 'getProbationStatus', token: A4 }).data).length === 2);
    t('bot stats admin-only (teacher denied)', call(a4, { action: 'getRpaStats', token: T2x }).status === 'error');
    t('bot stats ok for admin', call(a4, { action: 'getRpaStats', token: A4 }).status === 'success');
    // สิทธิ์เปลี่ยน → token เดิมหมดอายุ ต้องเข้าสู่ระบบใหม่
    upd('teacher2', [DBD, MECH]);
    t('changing majors revokes the old session', call(a4, { action: 'getRecords', token: T2x }).status === 'error');
    const T2y = tt('teacher2', 'TeacherPass2');
    t('login returns majors to the web app', JSON.stringify(T2y.user.majors) === JSON.stringify([DBD, MECH]));
    t('after re-login the wider scope applies', call(a4, { action: 'getRecords', token: T2y.token }).data.length === 4);
    // ข้อมูลเก่าไม่มีเจ้าของ: ครูที่ชื่อตรงกับ "ครูผู้บันทึก" ยังเห็น คนอื่นไม่เห็น
    e4.sheets.Records.rows.push(recHeader.map(() => ''));
    const legacy = e4.sheets.Records.rows[e4.sheets.Records.rows.length - 1];
    legacy[0] = 'legacy-1'; legacy[2] = '2026-09-01'; legacy[3] = '69219000199'; legacy[5] = 'เก่า'; legacy[6] = 'การบัญชี'; legacy[7] = 'ปวช.'; legacy[8] = '1'; legacy[10] = 'หนีเรียน'; legacy[11] = 10; legacy[12] = 'นางสาวครู หนึ่ง'; legacy[14] = 'pending';
    delete e4.store['records_raw_rows_v1'];
    t('legacy ownerless row: visible to the teacher whose name is on it', ids(tt('teacher1', 'TeacherPass1').token).indexOf('69219000199') !== -1);
    t('legacy ownerless row: hidden from unrelated teacher', ids(tt('teacher2', 'TeacherPass2').token).indexOf('69219000199') === -1);
    // getUsers เผยรายชื่อสาขาให้หน้าจัดการผู้ใช้
    const gu = call(a4, { action: 'getUsers', token: A4 });
    t('getUsers returns majors per user and the allowed major list', gu.majorNames.length > 10 && gu.data.find((u) => u.username === 'teacher2').majors.length === 2);
    t('createUser with majors', call(a4, { action: 'createUser', token: A4, data: { username: 'newteach', fullName: 'ครูใหม่', role: 'ครูผู้สอน', password: 'GoodPass123', majors: [DBD] } }).status === 'success');
    t('createUser rejects unknown major', call(a4, { action: 'createUser', token: A4, data: { username: 'badteach', fullName: 'x', role: 'ครูผู้สอน', password: 'GoodPass123', majors: ['ไม่มีจริง'] } }).status === 'error');
  }

  // ---- N2. กลุ่มสาขา ปวช./ปวส. เดียวกัน (คำขอ 28/9/69) — ครูรับผิดชอบสาขาหนึ่งต้องเห็นนักเรียนที่ใช้ชื่อ
  // หลักสูตรของอีกระดับด้วย เพราะเป็นสาขาเดียวกันจริงในทางปฏิบัติ (ดู MAJOR_GROUPS/majorGroupOf_ ใน Config.gs)
  {
    const e5 = fixture(); const a5 = build(e5);
    const A5 = login(a5, 'admin', 'AdminPass1').token;
    const spin5 = (ms) => { const s0 = Date.now(); while (Date.now() - s0 < ms); };
    const upd5 = (username, majors) => { const r0 = call(a5, { action: 'updateUser', token: A5, data: { username, fullName: e5.sheets.Users.rows.find((r) => r[0] === username)[2], role: 'ครูผู้สอน', majors } }); spin5(3); return r0; };
    upd5('teacher1', ['ช่างยนต์']);
    upd5('teacher2', ['การตลาด']);
    const T1z = login(a5, 'teacher1', 'TeacherPass1').token;
    const T2z = login(a5, 'teacher2', 'TeacherPass2').token;
    // แอดมินบันทึกแทนทุกรายการ กันไม่ให้ "เจ้าของรายการ" ไปบังผลของการเทียบสาขา
    const add5 = (sid, major) => call(a5, { action: 'addRecord', token: A5, data: validRecord({ studentId: sid, fieldOfStudy: major, clientRequestId: crypto.randomUUID() }) });
    add5('69219000201', 'เทคนิคเครื่องกล'); // ปวส. เทียบเท่า "ช่างยนต์"
    add5('69219000202', 'การตลาด');
    add5('69219000203', 'การจัดการธุรกิจค้าปลีก'); // ปวส.-only เทียบเท่า "การตลาด"
    add5('69219000204', 'เทคโนโลยีสารสนเทศ'); // ไม่เกี่ยวกับใครเลย
    const ids5 = (tok) => call(a5, { action: 'getRecords', token: tok }).data.map((x) => x.studentId).sort();
    t('teacher assigned "ช่างยนต์" also sees ปวส. "เทคนิคเครื่องกล" students', ids5(T1z).indexOf('69219000201') !== -1, ids5(T1z).join());
    t('teacher assigned "การตลาด" sees both "การตลาด" and ปวส.-only "การจัดการธุรกิจค้าปลีก"',
      ids5(T2z).indexOf('69219000202') !== -1 && ids5(T2z).indexOf('69219000203') !== -1, ids5(T2z).join());
    t('unrelated major stays hidden from both', ids5(T1z).indexOf('69219000204') === -1 && ids5(T2z).indexOf('69219000204') === -1);
    t('MAJOR_NAMES picklist collapsed to 14 canonical groups (was 21 raw names)',
      call(a5, { action: 'getUsers', token: A5 }).majorNames.length === 14);
  }

  // ---- M. คะแนนแก้ไขเองไม่ได้ (คำขอ 27/9/69) + รูปแบบวันที่ วัน/เดือน/ปี
  {
    const e5 = fixture(); const a5 = build(e5);
    const A5 = login(a5, 'admin', 'AdminPass1').token;
    const T5 = login(a5, 'teacher1', 'TeacherPass1').token;

    // ฐานความผิดที่มีคะแนนกำหนดตายตัว — ส่งคะแนนอื่นมาต้องถูกปฏิเสธ ต้องส่งคะแนนตรงเป๊ะถึงจะผ่าน
    const wrongPts = call(a5, { action: 'addRecord', token: T5, data: validRecord({ studentId: '69219000201', offense: 'หนีเรียน', points: '5', clientRequestId: crypto.randomUUID() }) });
    t('fixed-point offense: wrong points rejected', wrongPts.status === 'error' && /ตายตัว/.test(wrongPts.message), wrongPts.message);
    const rightPts = call(a5, { action: 'addRecord', token: T5, data: validRecord({ studentId: '69219000201', offense: 'หนีเรียน', points: '10', clientRequestId: crypto.randomUUID() }) });
    t('fixed-point offense: matching points accepted', rightPts.status === 'success');

    // "อื่นๆ" — เฉพาะ 5/10/15/20 เท่านั้น
    [3, 7, 25, 100].forEach((pts) => {
      const r = call(a5, { action: 'addRecord', token: T5, data: validRecord({ studentId: '69219000202', offense: 'อื่นๆ: ทดสอบ', points: String(pts), clientRequestId: crypto.randomUUID() }) });
      t(`"อื่นๆ" rejects ${pts} คะแนน`, r.status === 'error' && /อื่นๆ/.test(r.message), r.message);
    });
    // 0 ไม่ผ่านตั้งแต่การตรวจช่วงค่าทั่วไป (1-100) อยู่แล้ว ไม่ต้องไปถึงเงื่อนไขเฉพาะของ "อื่นๆ"
    t('"อื่นๆ" rejects 0 คะแนน (ช่วงค่าทั่วไปดักไว้ก่อน)',
      call(a5, { action: 'addRecord', token: T5, data: validRecord({ studentId: '69219000202', offense: 'อื่นๆ: ทดสอบ', points: '0', clientRequestId: crypto.randomUUID() }) }).status === 'error');
    [5, 10, 15, 20].forEach((pts) => {
      const r = call(a5, { action: 'addRecord', token: T5, data: validRecord({ studentId: '69219000202', offense: 'อื่นๆ: ทดสอบ', points: String(pts), clientRequestId: crypto.randomUUID() }) });
      t(`"อื่นๆ" accepts ${pts} คะแนน`, r.status === 'success', r.message || '');
    });

    // แก้ไขรายการก็ต้องผ่านกฎเดียวกัน
    const editWrong = call(a5, { action: 'updateRecord', token: T5, data: Object.assign(validRecord({ studentId: '69219000201', offense: 'หนีเรียน', points: '99' }), { id: rightPts.id }) });
    t('updateRecord also rejects mismatched fixed points', editWrong.status === 'error' && /ตายตัว/.test(editWrong.message));

    // รูปแบบวันที่: mapRowToRecord_/ทัณฑ์บน เป็น dd/mm/yyyy (พ.ศ.) ไม่ใช่ "10 ก.ย. 2569" แบบเดิม
    const rec = call(a5, { action: 'getRecords', token: A5 }).data.find((x) => x.id === rightPts.id);
    t('record displayDate is dd/mm/yyyy (BE)', /^\d{2}\/\d{2}\/\d{4}$/.test(rec.displayDate), rec.displayDate);
    const advT = login(a5, 'advisor', 'AdvisorPass1').token;
    call(a5, { action: 'addProbationRecord', token: advT, data: { studentId: '69219000201', studentName: 'ทดสอบ', date: '2026-09-05', note: 'x' } });
    const prob = Object.values(call(a5, { action: 'getProbationStatus', token: A5 }).data)[0][0];
    t('probation displayDate is dd/mm/yyyy (BE)', /^\d{2}\/\d{2}\/\d{4}$/.test(prob.displayDate), prob.displayDate);
  }

  // ---- L. doPost: ข้อความข้อผิดพลาด
  t('unknown action -> Invalid Action', call(api, { action: 'nope', token: A }).message === 'Invalid Action');
  t('expired token -> Thai session message', /เซสชัน/.test(call(api, { action: 'getRecords', token: 'bad' }).message));
  api.resetRequestMemo_();
  const garbage = JSON.parse(api.doPost({ postData: { contents: '{not json' } }).text);
  t('malformed body -> generic Thai message (no English internals)', garbage.status === 'error' && /[\u0E00-\u0E7F]/.test(garbage.message) && !/JSON|Unexpected/.test(garbage.message), garbage.message);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
