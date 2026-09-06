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

/* 배포된 코드가 무엇인지 확인하는 도장.
   저장(⌘S)만 하면 /exec 는 여전히 옛 버전을 돌린다 — 반드시 새 버전으로 배포해야 한다.
   ENDPOINT 주소를 브라우저로 열면 여기 적힌 값이 보인다. */
const VERSION = '2026-09-06 · 40열';

/* 열 이름이 바뀐 이력. ensureHeaders_ 가 먼저 적용해 중복 열이 생기지 않게 한다 */
const RENAME = [['출생연도', '생년월일'], ['얼굴', '페이스'], ['속눈썹·반영구', '반영구·기타']];

const HEADERS = [
  '접수시각','접수ID','성함','연락처','생년월일','거주·소속',
  '시술목적','소개자 성함','소개자 연락처',
  '동반방문','방문시간대',
  '시술경험 왁싱','시술경험 속눈썹','시술경험 반영구','시술경험 기타','관심 시술',
  '브라질리언','브라질리언 옵션','페이스','바디','집중케어',
  '연장 컬','연장 길이','연장 숱','연장 모질','펌 종류','펌 추가시술',
  '반영구·기타','신경쓰이는 점',
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
    if (p.cid && findId_(id)) return reply({ ok: true, id: id, cid: id, dup: true, ver: VERSION });

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
      '생년월일': p.birth || '', '거주·소속': p.area || '',
      '시술목적': p.purpose || '',
      '소개자 성함': p.refName || '', '소개자 연락처': p.refTel || '',
      '동반방문': p.party || '', '방문시간대': p.visit || '',
      '시술경험 왁싱': p.exWax || '', '시술경험 속눈썹': p.exLash || '',
      '시술경험 반영구': p.exSemi || '', '시술경험 기타': p.exEtc || '',
      '관심 시술': p.interest || '',
      '브라질리언': p.brazilian || '', '브라질리언 옵션': p.brOpt || '',
      '페이스': p.face || '', '바디': p.body || '', '집중케어': p.care || '',
      '연장 컬': p.lashCurl || '', '연장 길이': p.lashLen || '',
      '연장 숱': p.lashVol || '', '연장 모질': p.lashFib || '',
      '펌 종류': p.permType || '', '펌 추가시술': p.permAdd || '',
      '반영구·기타': p.etc || '',
      '신경쓰이는 점': p.worry || '',
      '안전확인': p.health || '', '안전확인 상세': p.hdetail || '', '최근 제모': p.shave || '',
      '임신주차': p.week || '', '임산부 특이사항': p.preg || '', '의사 주의사항': p.docnote || '',
      '시술동의': p.agreeTx || '', '개인정보동의': p.agreePI || '', '건강정보동의': p.agreeHealth || '',
      '서명': sigUrl, '원장확인': ''
    };
    rec['출생연도'] = rec['생년월일'];   // 아직 열 이름을 안 바꾼 시트 호환
    rec['얼굴']          = rec['페이스'];
    rec['속눈썹·반영구'] = rec['반영구·기타'];

    const sh = getSheet_();
    sh.appendRow(rowFor_(sh, rec));
    return reply({ ok: true, id: id, cid: id, ver: VERSION });

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
    else out = { ok: true, id: String(p.check), found: findId_(String(p.check)), ver: VERSION };
    return ContentService
      .createTextOutput(cb + '(' + JSON.stringify(out) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return HtmlService.createHtmlOutput(
    '<p style="font-family:sans-serif">OK &middot; ' + VERSION + '</p>');
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
 * HEADERS 에 있는데 시트에 없는 열을 만들어 넣는다.
 * 폼에 항목이 추가돼도 값이 조용히 버려지지 않는다.
 * 넣는 자리는 HEADERS 기준 바로 앞 열의 뒤 — 원장이 옮겨도 이름으로 찾으므로 상관없다.
 */
function ensureHeaders_(sh) {
  const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1))
                 .getDisplayValues()[0].map(function (x) { return String(x).trim(); });
  let changed = false;

  // 옛 이름을 먼저 새 이름으로 바꾼다. 이걸 나중에 하면 아래 루프가
  // '페이스' 열을 새로 끼워 넣어 '얼굴' 과 중복되고, 값이 두 열로 나뉜다.
  RENAME.forEach(function (r) {
    const i = head.indexOf(r[0]);
    if (i < 0) return;
    if (head.indexOf(r[1]) >= 0) {          // 새 이름이 이미 있으면 바꾸는 순간 중복이 된다
      Logger.log("'" + r[0] + "' 와 '" + r[1] + "' 가 둘 다 있습니다 — 수동 확인 필요");
      return;
    }
    sh.getRange(1, i + 1).setValue(r[1]);
    head[i] = r[1]; changed = true;
    Logger.log("열 이름 변경: '" + r[0] + "' → '" + r[1] + "'");
  });

  for (let i = 0; i < HEADERS.length; i++) {
    const h = HEADERS[i];
    if (head.indexOf(h) >= 0) continue;

    let at = 0;                                   // 0 = 맨 앞
    for (let j = i - 1; j >= 0; j--) {
      const k = head.indexOf(HEADERS[j]);
      if (k >= 0) { at = k + 1; break; }
    }
    if (at === 0) sh.insertColumnBefore(1); else sh.insertColumnAfter(at);
    sh.getRange(1, at + 1).setValue(h);
    head.splice(at, 0, h);
    changed = true;
  }
  if (changed) {
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#f0ece3');
    Logger.log('헤더 보정 완료: ' + head.join(' | '));
  }
  return head;
}

/**
 * 시트에 실제로 적혀 있는 헤더 순서에 맞춰 한 행을 만든다.
 * 열을 더하거나 빼도 값이 밀리지 않는다 — 모르는 열은 빈칸으로 남긴다.
 */
function rowFor_(sh, rec) {
  return ensureHeaders_(sh).map(function (h) {
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
  const now = ensureHeaders_(sh);   // 이름 변경 + 빠진 열 생성

  Logger.log('편집기에서 실행 중인 코드 버전: ' + VERSION);
  Logger.log('※ 이 버전이 /exec 에도 반영되려면 [배포 관리 → 연필 → 새 버전] 이 필요합니다');
  if (now.indexOf('마케팅동의') >= 0)
    Logger.log("'마케팅동의' 열은 과거 기록 보존을 위해 남겨둡니다 (새 행은 빈칸). " +
               '정말 지우려면 마케팅동의열삭제() 를 실행하세요.');
  Logger.log('현재 헤더(' + now.length + '): ' + now.join(' | '));
}

/* ───────────────────────────────────────────────────────────
   옛 배포본이 쓴 행 복구

   /exec 에 새 버전을 배포하지 않으면, 시트 헤더는 새 39열인데
   기록은 옛 25열 순서로 들어간다. 그 행들을 지금 헤더에 맞게 옮긴다.
   ─────────────────────────────────────────────────────────── */
const OLD_ORDER = [
  '접수시각','접수ID','성함','연락처','출생연도','거주·소속','동반방문',
  '브라질리언','브라질리언 옵션','얼굴','바디','속눈썹·반영구','신경쓰이는 점',
  '안전확인','안전확인 상세','최근 제모',
  '임신주차','임산부 특이사항','의사 주의사항',
  '시술동의','개인정보동의','건강정보동의','마케팅동의',
  '서명','원장확인'
];

/** 옛 순서로 쓰인 행인지 — 시술동의('동의')가 옛 자리에만 있으면 그렇다 */
function isOldRow_(vals) {
  const oldAt = OLD_ORDER.indexOf('시술동의');          // 19
  const newAt = HEADERS.indexOf('시술동의');            // 34
  return String(vals[1] || '').trim() !== ''
      && String(vals[oldAt] || '').trim() === '동의'
      && String(vals[newAt] || '').trim() !== '동의';
}

function 옛행복구_미리보기() { 옛행복구_(false); }
function 옛행복구_실행()   { 옛행복구_(true); }

function 옛행복구_(apply) {
  const sh   = getSheet_();
  const head = ensureHeaders_(sh);
  const map  = {}; RENAME.forEach(function (r) { map[r[0]] = r[1]; });
  const last = sh.getLastRow();
  if (last < 2) { Logger.log('데이터 행이 없습니다'); return; }

  const width = Math.max(sh.getLastColumn(), head.length);
  const data  = sh.getRange(2, 1, last - 1, width).getValues();
  let n = 0;

  for (let i = 0; i < data.length; i++) {
    const vals = data[i];
    if (!isOldRow_(vals)) continue;
    n++;

    const rec = {};
    for (let j = 0; j < OLD_ORDER.length; j++) {
      const key = map[OLD_ORDER[j]] || OLD_ORDER[j];
      rec[key] = vals[j];
    }
    const row = head.map(function (h) {
      return Object.prototype.hasOwnProperty.call(rec, h) ? rec[h] : '';
    });
    Logger.log((apply ? '복구' : '대상') + ' ' + (i + 2) + '행 · ' +
               rec['접수ID'] + ' · ' + rec['성함']);
    if (apply) sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
  }

  Logger.log(n === 0 ? '옛 순서로 쓰인 행이 없습니다 — 손댈 것 없음'
                     : (apply ? n + '행을 현재 헤더에 맞게 옮겼습니다'
                              : n + '행이 대상입니다. 맞으면 옛행복구_실행() 을 실행하세요'));
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