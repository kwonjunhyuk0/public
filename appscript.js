/**
 * 구름왁싱 고객카드 → Google Sheet 수집기
 * ─────────────────────────────────────────────
 * 배포: 확장 프로그램 → Apps Script → 배포 → 새 배포
 *       유형: 웹 앱 / 실행: 나 / 액세스: 모든 사용자
 * ───────────────────────────────────────────── */

// ▼▼▼ 아래 3개만 바꾸면 됩니다 ▼▼▼
const SHEET_ID  = '1CJACHMOoYcdrH86YZjEYFPAxl8haBGMJ9Mj-bHfKbZ8';   // 시트 URL 의 /d/ 와 /edit 사이 문자열
const FOLDER_ID = '1spMQvHYGwq7nkainCaRaCbMJ7KhQXF0G';  // Drive 폴더 URL 의 /folders/ 뒤 문자열
const TOKEN     = 'gureum-2026-x7k9qpjeifnqzmskvmbr';           // HTML 의 TOKEN 과 똑같이
// ▲▲▲ ─────────────────────────────── ▲▲▲

const SHEET_NAME = '고객카드';

const HEADERS = [
  '접수시각','접수ID','성함','연락처','출생연도','거주·소속','동반방문',
  '브라질리언','브라질리언 옵션','얼굴','바디','속눈썹·반영구','신경쓰이는 점',
  '안전확인','안전확인 상세','최근 제모',
  '임신주차','임산부 특이사항','의사 주의사항',
  '시술동의','개인정보동의','건강정보동의','마케팅동의',
  '서명','원장확인'
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const p = (e && e.parameter) || {};

    if (p.token !== TOKEN) return reply({ ok: false, msg: '인증 실패' });
    if (!p.name || !p.tel)  return reply({ ok: false, msg: '필수 항목 누락' });

    const now = new Date();
    const id  = Utilities.formatDate(now, 'Asia/Seoul', 'yyMMdd-HHmmss');

    // 서명 이미지는 Drive 에 저장하고 시트에는 링크만 (셀 5만자 제한 회피)
    let sigUrl = '';
    if (p.signature && p.signature.indexOf('data:image') === 0) {
      try {
        const b64  = p.signature.split(',')[1];
        const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/png',
                       'sign_' + id + '_' + p.name + '.png');
        sigUrl = DriveApp.getFolderById(FOLDER_ID).createFile(blob).getUrl();
      } catch (err) { sigUrl = '저장실패: ' + err; }
    }

    const sh = getSheet_();
    sh.appendRow([
      Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'), id,
      p.name || '', p.tel || '', p.birth || '', p.area || '', p.party || '',
      p.brazilian || '', p.brOpt || '', p.face || '', p.body || '', p.etc || '',
      p.worry || '', p.health || '', p.hdetail || '', p.shave || '',
      p.week || '', p.preg || '', p.docnote || '',
      p.agreeTx || '', p.agreePI || '', p.agreeHealth || '', p.agreeMkt || '',
      sigUrl, ''
    ]);
    return reply({ ok: true, id: id });

  } catch (err) {
    return reply({ ok: false, msg: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/** 브라우저에서 URL 을 직접 열었을 때 — 데이터는 절대 노출하지 않습니다 */
function doGet() {
  return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">OK</p>');
}

function getSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#f0ece3');
    sh.setColumnWidth(1, 150); sh.setColumnWidth(3, 90); sh.setColumnWidth(4, 130);
  }
  return sh;
}

/** iframe 안에서 부모창으로 결과를 알려주는 응답 */
function reply(obj) {
  const payload = JSON.stringify(obj).replace(/</g, '\\u003c');
  return HtmlService
    .createHtmlOutput('<script>parent.postMessage(' +
      JSON.stringify(payload) + ',"*")<\/script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 설치 확인용 — 편집기에서 한 번 실행해 권한을 승인하세요 */
function 설치테스트() {
  const sh = getSheet_();
  Logger.log('시트 연결 OK: ' + sh.getName() + ' / 현재 ' + sh.getLastRow() + '행');
  const f = DriveApp.getFolderById(FOLDER_ID);
  Logger.log('폴더 연결 OK: ' + f.getName());
}