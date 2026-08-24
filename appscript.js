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
  '접수시각','접수ID','성함','연락처','생년월일','거주·소속','동반방문',
  '브라질리언','브라질리언 옵션','얼굴','바디','속눈썹·반영구','신경쓰이는 점',
  '안전확인','안전확인 상세','최근 제모',
  '임신주차','임산부 특이사항','의사 주의사항',
  '시술동의','개인정보동의','건강정보동의',
  '서명','원장확인'
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const p = (e && e.parameter) || {};

    if (p.token !== TOKEN) return reply({ ok: false, msg: '인증 실패', cid: p.cid || '' });
    if (!p.name || !p.tel)  return reply({ ok: false, msg: '필수 항목 누락', cid: p.cid || '' });

    const now = new Date();
    // 접수번호는 클라이언트가 만들어 보낸다. 없으면(구버전 폼) 서버에서 생성
    const id  = String(p.cid || '').trim()
              || Utilities.formatDate(now, 'Asia/Seoul', 'yyMMdd-HHmmss');

    // 같은 접수번호가 이미 있으면 재전송이므로 다시 쓰지 않는다
    if (p.cid && findId_(id)) return reply({ ok: true, id: id, cid: id, dup: true });

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

    const rec = {
      '접수시각': Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss'),
      '접수ID': id,
      '성함': p.name || '', '연락처': p.tel || '',
      '생년월일': p.birth || '', '거주·소속': p.area || '', '동반방문': p.party || '',
      '브라질리언': p.brazilian || '', '브라질리언 옵션': p.brOpt || '',
      '얼굴': p.face || '', '바디': p.body || '', '속눈썹·반영구': p.etc || '',
      '신경쓰이는 점': p.worry || '',
      '안전확인': p.health || '', '안전확인 상세': p.hdetail || '', '최근 제모': p.shave || '',
      '임신주차': p.week || '', '임산부 특이사항': p.preg || '', '의사 주의사항': p.docnote || '',
      '시술동의': p.agreeTx || '', '개인정보동의': p.agreePI || '', '건강정보동의': p.agreeHealth || '',
      '서명': sigUrl, '원장확인': ''
    };
    rec['출생연도'] = rec['생년월일'];   // 아직 열 이름을 안 바꾼 시트 호환

    const sh = getSheet_();
    sh.appendRow(rowFor_(sh, rec));
    return reply({ ok: true, id: id, cid: id });

  } catch (err) {
    return reply({ ok: false, msg: String(err), cid: (e && e.parameter && e.parameter.cid) || '' });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/**
 * GET — 두 가지 용도
 *  1) ?token=..&check=<접수번호>&callback=<함수명>  : 저장 여부만 JSONP 로 알려준다
 *     (폼의 postMessage 응답이 유실됐을 때의 확인 경로. CORS 를 안 타려고 JSONP 를 쓴다)
 *  2) 그 외 — 사람이 URL 을 직접 연 경우. 데이터는 절대 노출하지 않는다
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const cb = String(p.callback || '');

  if (cb && p.check) {
    // 콜백 이름을 그대로 붙이므로 반드시 걸러낸다
    if (!/^[A-Za-z0-9_$]{1,40}$/.test(cb)) {
      return ContentService.createTextOutput('')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    let out;
    if (p.token !== TOKEN) out = { ok: false, msg: '인증 실패' };
    else out = { ok: true, id: String(p.check), found: findId_(String(p.check)) };
    return ContentService
      .createTextOutput(cb + '(' + JSON.stringify(out) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return HtmlService.createHtmlOutput('<p style="font-family:sans-serif">OK</p>');
}

/** 접수ID(B열)에 해당 번호가 이미 있는지 */
function findId_(id) {
  if (!id) return false;
  const sh = getSheet_();
  const n = sh.getLastRow() - 1;
  if (n < 1) return false;
  const col = sh.getRange(2, 2, n, 1).getDisplayValues();
  for (let i = 0; i < col.length; i++) if (String(col[i][0]).trim() === id) return true;
  return false;
}

/**
 * 시트에 실제로 적혀 있는 헤더 순서에 맞춰 한 행을 만든다.
 * 열을 더하거나 빼도 값이 밀리지 않는다 — 모르는 열은 빈칸으로 남긴다.
 */
function rowFor_(sh, rec) {
  const w = Math.max(sh.getLastColumn(), HEADERS.length);
  const head = sh.getRange(1, 1, 1, w).getDisplayValues()[0];
  return head.map(function (h) {
    const k = String(h).trim();
    return Object.prototype.hasOwnProperty.call(rec, k) ? rec[k] : '';
  });
}

/**
 * ★ 한 번만 실행 — 기존 시트의 '출생연도' 열 이름을 '생년월일' 로 바꾼다.
 *   마케팅동의 열은 지우지 않는다. 과거에 동의한 고객의 기록이므로 남겨둔다
 *   (폼에서 항목이 빠졌으니 새 행은 이 열이 빈칸이 된다).
 */
function 시트열정리() {
  const sh = getSheet_();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0]
                 .map(function (x) { return String(x).trim(); });

  const i = head.indexOf('출생연도');
  if (i >= 0) { sh.getRange(1, i + 1).setValue('생년월일'); head[i] = '생년월일';
                Logger.log("열 이름 변경: '출생연도' → '생년월일'"); }
  else        { Logger.log("'출생연도' 열 없음 — 이미 정리됨"); }

  const m = head.indexOf('마케팅동의');
  if (m >= 0) Logger.log("'마케팅동의' 열은 과거 기록 보존을 위해 남겨둡니다 (새 행은 빈칸). " +
                         '정말 지우려면 마케팅동의열삭제() 를 실행하세요.');
  Logger.log('현재 헤더(' + head.length + '): ' + head.join(' | '));
}

/** 과거 마케팅 동의 기록까지 완전히 삭제한다 — 되돌릴 수 없다 */
function 마케팅동의열삭제() {
  const sh = getSheet_();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0]
                 .map(function (x) { return String(x).trim(); });
  const m = head.indexOf('마케팅동의');
  if (m < 0) { Logger.log('마케팅동의 열이 없습니다'); return; }
  sh.deleteColumn(m + 1);
  Logger.log('마케팅동의 열을 삭제했습니다');
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

/**
 * iframe 안에서 결과를 알려주는 응답.
 *
 * ★ Apps Script 는 이 HTML 을 자기 샌드박스 iframe(googleusercontent.com)으로
 *   한 번 더 감싼다. 그래서 이 스크립트에서 parent 는 우리 폼이 아니라
 *   script.google.com 의 exec 페이지다. parent 한 곳에만 보내면 폼에는
 *   영원히 도달하지 않는다 — 조상 창을 끝까지 거슬러 올라가며 전부 보낸다.
 */
function reply(obj) {
  const payload = JSON.stringify(obj).replace(/</g, '\\u003c');
  const js =
    '(function(){var m=' + JSON.stringify(payload) + ',seen=[];' +
    'function send(w){if(!w)return;for(var i=0;i<seen.length;i++)if(seen[i]===w)return;' +
    'seen.push(w);try{w.postMessage(m,"*")}catch(e){}}' +
    'var w=window;for(var i=0;i<10;i++){var q;try{q=w.parent}catch(e){break}' +
    'if(!q||q===w)break;w=q;send(w)}' +
    'try{send(window.top)}catch(e){}})();';
  return HtmlService
    .createHtmlOutput('<script>' + js + '<\/script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 설치 확인용 — 편집기에서 한 번 실행해 권한을 승인하세요 */
function 설치테스트() {
  const sh = getSheet_();
  Logger.log('시트 연결 OK: ' + sh.getName() + ' / 현재 ' + sh.getLastRow() + '행');
  const f = DriveApp.getFolderById(FOLDER_ID);
  Logger.log('폴더 연결 OK: ' + f.getName());
}