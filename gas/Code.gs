/**
 * とおまち 夏花火ナイト｜有料観覧席 予約受付（Google Apps Script）
 *
 * できること
 *  - reserve.html から送られた予約を、スプレッドシートの「予約」シートに1行ずつ記録
 *  - 先着順の残席管理（同時に送信されても売り越さないよう排他制御）
 *  - 予約者への予約完了メール／管理者への通知メール
 *  - reserve.html を開いたときの残席チェック（doGet）
 *
 * 使い方は README.md の「GASの設定手順」を見てください。
 * 最初に一度だけ、エディタ上部の関数選択で「setup」を選んで実行してください。
 */

/* =========================================================
   設定（ここだけ書き換えればOK）
   ========================================================= */
const CONFIG = {
  SHEET_NAME: '予約',
  CAPACITY: 200,            // 有料観覧席の総数（仮の数。実際の席数に変更）
  MAX_PER_BOOKING: 6,       // 1回の予約で取れる上限（reserve.html の MAX_SEATS と合わせる）
  PRICE: 1500,              // 1名あたりの料金（税込）
  ID_PREFIX: 'TM-',         // 予約番号の頭につく文字
  ADMIN_EMAIL: '',          // 予約が入ったら通知を受け取るアドレス（空なら通知しない）
  SENDER_NAME: 'とおまち観光協会',
  REPLY_TO: '',             // 予約者が返信したときの宛先（空ならスクリプトを動かしているGoogleアカウント）
  CONTACT_EMAIL: 'info@toomachi-kanko.jp',
  LINE_URL: 'https://line.me/R/ti/p/{LINE_ID}',
};

const HEADERS = ['受付日時', '予約番号', 'ステータス', '枚数', '合計金額', 'お名前', 'フリガナ', 'メールアドレス', '電話番号', 'ご質問・ご要望', '予約完了メール'];
const COL = Object.fromEntries(HEADERS.map((h, i) => [h, i])); // 列名 → 0始まりの番号
const STATUS = { ACTIVE: '予約済み', CANCELED: 'キャンセル', ATTENDED: '来場済み' };

/* =========================================================
   初回だけ実行：シートの見出しと、ステータスのプルダウンを作る
   ========================================================= */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#1B2A4A').setFontColor('#FFF6E5');
  sheet.setFrozenRows(1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.values(STATUS), true).setAllowInvalid(false).build();
  sheet.getRange(2, COL['ステータス'] + 1, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
  sheet.autoResizeColumns(1, HEADERS.length);
  Logger.log('準備ができました。シート「%s」を確認してください。', CONFIG.SHEET_NAME);
}

/* =========================================================
   reserve.html を開いたとき：残席を返す
   ========================================================= */
function doGet() {
  return json_({ ok: true, remaining: Math.max(0, CONFIG.CAPACITY - countReservedSeats_(getSheet_())) });
}

/* =========================================================
   予約の受付
   ========================================================= */
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, code: 'INVALID', message: 'JSONを読み取れませんでした' });
  }

  // 迷惑送信対策：見えない欄に入力があれば、成功したふりをして記録しない
  if (data.website) return json_({ ok: true, id: CONFIG.ID_PREFIX + '0000' });

  const v = validate_(data);
  if (v.errors.length) return json_({ ok: false, code: 'INVALID', errors: v.errors });
  const d = v.data;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // 同時送信で席を売り越さないよう、1件ずつ順番に処理
  } catch (err) {
    return json_({ ok: false, code: 'BUSY', message: '混み合っています。少し待ってから再度お試しください。' });
  }

  let id, row, rowIndex;
  try {
    const sheet = getSheet_();

    // 同じ人の二重送信（通信の再試行など）は、最初の予約番号を返す
    const dup = findRecentDuplicate_(sheet, d);
    if (dup) return json_({ ok: true, id: dup, duplicate: true });

    const remaining = CONFIG.CAPACITY - countReservedSeats_(sheet);
    if (remaining <= 0) return json_({ ok: false, code: 'SOLD_OUT', remaining: 0 });
    if (d.seats > remaining) return json_({ ok: false, code: 'NOT_ENOUGH', remaining: remaining });

    id = nextId_();
    row = new Array(HEADERS.length).fill('');
    row[COL['受付日時']] = new Date();
    row[COL['予約番号']] = id;
    row[COL['ステータス']] = STATUS.ACTIVE;
    row[COL['枚数']] = d.seats;
    row[COL['合計金額']] = d.seats * CONFIG.PRICE;
    row[COL['お名前']] = safe_(d.name);
    row[COL['フリガナ']] = safe_(d.kana);
    row[COL['メールアドレス']] = safe_(d.email);
    row[COL['電話番号']] = "'" + d.tel; // 先頭の0が消えないよう文字列として保存
    row[COL['ご質問・ご要望']] = safe_(d.note);
    sheet.appendRow(row);
    SpreadsheetApp.flush();
    rowIndex = sheet.getLastRow(); // ロック中に行番号を確定（他の予約と取り違えないため）
  } finally {
    lock.releaseLock();
  }

  // メール送信（失敗しても予約自体は成立させ、シートに結果を残す）
  let mailResult = '送信済み';
  try {
    sendConfirmation_(id, d);
  } catch (err) {
    mailResult = '送信失敗：' + err.message;
  }
  getSheet_().getRange(rowIndex, COL['予約完了メール'] + 1).setValue(mailResult);

  if (CONFIG.ADMIN_EMAIL) {
    try { notifyAdmin_(id, d); } catch (err) { console.error(err); }
  }

  return json_({ ok: true, id: id });
}

/* =========================================================
   入力チェック（ブラウザ側と同じルールを、サーバー側でももう一度）
   ========================================================= */
function validate_(raw) {
  const errors = [];
  const str = (v) => (v == null ? '' : String(v)).trim();
  const d = {
    seats: Number(raw.seats),
    name: str(raw.name).slice(0, 50),
    kana: str(raw.kana).slice(0, 50),
    email: str(raw.email).slice(0, 254),
    tel: str(raw.tel).replace(/[^\d-]/g, '').slice(0, 20),
    note: str(raw.note).slice(0, 500),
  };
  if (!Number.isInteger(d.seats) || d.seats < 1 || d.seats > CONFIG.MAX_PER_BOOKING) errors.push('seats');
  if (!d.name) errors.push('name');
  if (!/^[ァ-ヶー\s]+$/.test(d.kana)) errors.push('kana');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) errors.push('email');
  if (!/^0\d{9,10}$/.test(d.tel.replace(/-/g, ''))) errors.push('tel');
  return { errors: errors, data: d };
}

/* =========================================================
   メール
   ========================================================= */
function sendConfirmation_(id, d) {
  const total = (d.seats * CONFIG.PRICE).toLocaleString('ja-JP');
  const body = [
    d.name + ' さま',
    '',
    'このたびは「とおまち 夏花火ナイト」の観覧席をご予約いただき、ありがとうございます。',
    '以下の内容でご予約を承りました。',
    '',
    '━━━━━━━━━━━━━━━━━━',
    '予約番号　：' + id,
    'イベント　：とおまち 夏花火ナイト',
    '開催日　　：8月中旬の土曜',
    '会場　　　：とおまち川河川敷（とおまち駅から徒歩約10分）',
    '席種　　　：有料観覧席',
    '枚数　　　：' + d.seats + '名',
    '合計金額　：¥' + total + '（税込）',
    'お支払い　：当日、観覧席受付にて',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '当日は、観覧席受付でこの予約番号をお伝えください。',
    '',
    '■キャンセルについて',
    '開催前日の17時まで、無料でキャンセルできます。',
    'このメールに返信するか、公式LINEでご連絡ください。',
    '',
    '■雨の日について',
    '小雨決行です。荒天時は翌日に延期となる場合があります。',
    '最新情報は当日、公式LINEでご案内します。',
    '',
    '■泊まって、夜もゆっくりしませんか？',
    '町の宿は数に限りがあります。気になる宿があれば、公式LINEで空室・プランをご案内します。',
    CONFIG.LINE_URL,
    '',
    '気合いを入れすぎずに、ふらっと遊びに来てくださいね。',
    '当日お会いできるのを楽しみにしています。',
    '',
    '──────────────────',
    'とおまち観光協会',
    'お問い合わせ：' + CONFIG.CONTACT_EMAIL,
    '平日 9:00〜17:00（夏季イベント期間中は土日対応あり）',
  ].join('\n');

  const options = { name: CONFIG.SENDER_NAME };
  if (CONFIG.REPLY_TO) options.replyTo = CONFIG.REPLY_TO;
  MailApp.sendEmail(d.email, '【とおまち 夏花火ナイト】観覧席のご予約を承りました（予約番号 ' + id + '）', body, options);
}

function notifyAdmin_(id, d) {
  const remaining = CONFIG.CAPACITY - countReservedSeats_(getSheet_());
  const body = [
    '観覧席の予約が入りました。',
    '',
    '予約番号：' + id,
    '枚数　　：' + d.seats + '名（¥' + (d.seats * CONFIG.PRICE).toLocaleString('ja-JP') + '）',
    'お名前　：' + d.name + '（' + d.kana + '）',
    'メール　：' + d.email,
    '電話番号：' + d.tel,
    'ご要望　：' + (d.note || 'なし'),
    '',
    '残席：' + remaining + ' / ' + CONFIG.CAPACITY,
    SpreadsheetApp.getActiveSpreadsheet().getUrl(),
  ].join('\n');
  MailApp.sendEmail(CONFIG.ADMIN_EMAIL, '【予約】' + id + '｜' + d.seats + '名｜' + d.name + ' さま', body, { name: '予約通知' });
}

/* =========================================================
   小さな道具
   ========================================================= */
function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error('シート「' + CONFIG.SHEET_NAME + '」がありません。setup を実行してください。');
  return sheet;
}

// 「キャンセル」以外の行の枚数を合計（来場済みも席を使ったものとして数える）
function countReservedSeats_(sheet) {
  const n = sheet.getLastRow() - 1;
  if (n <= 0) return 0;
  return sheet.getRange(2, 1, n, HEADERS.length).getValues()
    .filter((r) => r[COL['予約番号']] && r[COL['ステータス']] !== STATUS.CANCELED)
    .reduce((sum, r) => sum + (Number(r[COL['枚数']]) || 0), 0);
}

// 直近10分以内に、同じメール・電話番号・枚数の予約があれば、その予約番号を返す
function findRecentDuplicate_(sheet, d) {
  const n = Math.min(sheet.getLastRow() - 1, 30);
  if (n <= 0) return null;
  const rows = sheet.getRange(sheet.getLastRow() - n + 1, 1, n, HEADERS.length).getValues();
  const limit = Date.now() - 10 * 60 * 1000;
  const tel = d.tel.replace(/-/g, '');
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    const t = r[COL['受付日時']];
    if (!(t instanceof Date) || t.getTime() < limit) continue;
    if (String(r[COL['メールアドレス']]) === d.email &&
        String(r[COL['電話番号']]).replace(/[^\d]/g, '') === tel &&
        Number(r[COL['枚数']]) === d.seats &&
        r[COL['ステータス']] !== STATUS.CANCELED) {
      return r[COL['予約番号']];
    }
  }
  return null;
}

// TM-0001, TM-0002 … の連番（ロック中に呼ぶ）
function nextId_() {
  const props = PropertiesService.getScriptProperties();
  const n = Number(props.getProperty('LAST_ID') || 0) + 1;
  props.setProperty('LAST_ID', String(n));
  return CONFIG.ID_PREFIX + ('000' + n).slice(-4);
}

// 「=」「+」「-」「@」で始まる入力が、スプレッドシートの数式として動かないようにする
function safe_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
   テスト用：エディタから実行すると、ダミーの予約を1件記録してメールを送ります
   （MY_EMAIL を自分のアドレスにしてから実行。確認後、シートの行は削除してOK）
   ========================================================= */
function testReservation() {
  const MY_EMAIL = 'your-address@example.com';
  const res = doPost({ postData: { contents: JSON.stringify({
    seats: 2, name: 'テスト 美咲', kana: 'テスト ミサキ', email: MY_EMAIL, tel: '090-1234-5678', note: 'テスト送信です',
  }) } });
  Logger.log(res.getContent());
}
