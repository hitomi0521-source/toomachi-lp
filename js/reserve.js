/* とおまち 夏花火ナイト：予約フォームの動き（reserve.html） */

(() => {
  /* =========================================================
     設定
     GAS_URL：GASを「ウェブアプリ」としてデプロイしたURL（…/exec）に差し替え
     未設定（'{GAS_URL}' のまま）のときは、通信せずに動く「デモモード」になります
     ========================================================= */
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbwsJNs0xZqtgrLv4RyVAdtSVaj1BrAemhFiXIFqQ2thvYJghuRmgqFSOYeN6L6i6clB3A/exec';
  const LINE_ID = '{LINE_ID}';
  const PRICE = 1500;
  const MAX_SEATS = 6;

  const isDemo = GAS_URL.includes('{');
  const $ = (id) => document.getElementById(id);
  const yen = (n) => '¥' + n.toLocaleString('ja-JP');

  document.querySelectorAll('[data-line]').forEach((el) => { el.href = `https://line.me/R/ti/p/${LINE_ID}`; });

  /* ---------- 画面の切り替え ---------- */
  const sections = { input: $('step-input'), confirm: $('step-confirm'), done: $('step-done') };
  const order = ['input', 'confirm', 'done'];
  function showStep(name, focusEl) {
    Object.entries(sections).forEach(([k, el]) => { el.hidden = k !== name; });
    document.querySelectorAll('.steps li').forEach((li) => {
      const i = order.indexOf(li.dataset.step), cur = order.indexOf(name);
      li.classList.toggle('is-done', i < cur);
      if (i === cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0 });
    if (focusEl) focusEl.focus({ preventScroll: true });
  }

  /* ---------- 入力の整形 ---------- */
  const toHalf = (s) => s.replace(/[０-９Ａ-Ｚａ-ｚ＠．－＿＋]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[ー−‐―]/g, '-');
  const hiraToKata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

  $('kana').addEventListener('blur', (e) => { e.target.value = hiraToKata(e.target.value).replace(/　/g, ' ').trim(); });
  ['email', 'email2'].forEach((id) => $(id).addEventListener('blur', (e) => { e.target.value = toHalf(e.target.value).trim(); }));
  $('tel').addEventListener('blur', (e) => { e.target.value = toHalf(e.target.value).replace(/[^\d-]/g, ''); });

  /* ---------- 合計金額 ---------- */
  const updateTotal = () => { $('total-price').textContent = yen(Number($('seats').value) * PRICE); };
  $('seats').addEventListener('change', updateTotal);
  updateTotal();

  /* ---------- バリデーション ---------- */
  const rules = {
    seats: (v) => (Number.isInteger(+v) && +v >= 1 && +v <= MAX_SEATS) ? '' : `枚数は1〜${MAX_SEATS}名で選んでください。`,
    name: (v) => v.trim() ? '' : 'お名前を入力してください。',
    kana: (v) => !v.trim() ? 'フリガナを入力してください。' : (/^[ァ-ヶー\s]+$/.test(v.trim()) ? '' : 'フリガナはカタカナで入力してください。'),
    email: (v) => !v.trim() ? 'メールアドレスを入力してください。' : (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'メールアドレスの形式を確認してください（例：misaki@example.com）。'),
    email2: (v) => !v.trim() ? '確認用のメールアドレスを入力してください。' : (v.trim() === $('email').value.trim() ? '' : 'メールアドレスが一致しません。'),
    tel: (v) => !v.trim() ? '電話番号を入力してください。' : (/^0\d{9,10}$/.test(v.replace(/-/g, '')) ? '' : '電話番号は0から始まる10〜11桁の数字で入力してください。'),
    note: (v) => v.length <= 500 ? '' : 'ご質問・ご要望は500文字以内でお願いします。',
    agree: (_, el) => el.checked ? '' : '内容をご確認のうえ、同意にチェックを入れてください。',
  };
  const labels = { seats: '枚数', name: 'お名前', kana: 'フリガナ', email: 'メールアドレス', email2: 'メールアドレス（確認用）', tel: '電話番号', note: 'ご質問・ご要望', agree: '同意' };

  function validateField(id) {
    const el = $(id);
    const msg = rules[id](el.value, el);
    $(`${id}-error`).textContent = msg;
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return msg;
  }
  // 一度エラーになった欄は、直したその場でエラーを消す
  Object.keys(rules).forEach((id) => {
    const ev = id === 'agree' || id === 'seats' ? 'change' : 'input';
    $(id).addEventListener(ev, () => { if ($(id).getAttribute('aria-invalid') === 'true') validateField(id); });
    if (!['agree', 'seats'].includes(id)) $(id).addEventListener('blur', () => { if ($(id).value) validateField(id); });
  });

  /* ---------- STEP1 → STEP2 ---------- */
  const form = $('reserve-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ['kana', 'email', 'email2', 'tel'].forEach((id) => $(id).dispatchEvent(new Event('blur')));
    const errors = Object.keys(rules).map((id) => [id, validateField(id)]).filter(([, m]) => m);
    const box = $('error-summary');
    if (errors.length) {
      box.innerHTML = `入力内容をご確認ください（${errors.length}件）<ul>` +
        errors.map(([id, m]) => `<li><a href="#${id}">${labels[id]}：${m}</a></li>`).join('') + '</ul>';
      box.hidden = false;
      box.focus();
      return;
    }
    box.hidden = true;
    renderConfirm();
    $('send-error').hidden = true;
    showStep('confirm', $('confirm-title'));
  });
  $('error-summary').addEventListener('click', (e) => {
    const a = e.target.closest('a'); if (!a) return;
    e.preventDefault(); const t = $(a.getAttribute('href').slice(1)); t.focus(); t.scrollIntoView({ block: 'center' });
  });

  /* ---------- 確認画面 ---------- */
  const getData = () => ({
    seats: Number($('seats').value),
    name: $('name').value.trim(),
    kana: $('kana').value.trim(),
    email: $('email').value.trim(),
    tel: $('tel').value.trim(),
    note: $('note').value.trim(),
    website: $('website').value, // 迷惑送信対策
  });
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function renderConfirm() {
    const d = getData();
    const rows = [
      ['開催日', '8月中旬の土曜'], ['席種', '有料観覧席'], ['枚数', `${d.seats}名`],
      ['お名前', d.name], ['フリガナ', d.kana], ['メールアドレス', d.email], ['電話番号', d.tel],
      ['ご質問・ご要望', d.note || '（なし）'],
    ];
    $('confirm-list').innerHTML = rows.map(([k, v]) => `<div class="summary-row"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('confirm-total').textContent = yen(d.seats * PRICE);
  }
  $('back-to-input').addEventListener('click', () => showStep('input', $('seats')));

  /* ---------- 送信 ---------- */
  const submitBtn = $('submit-btn');
  let sending = false;
  function setSending(on) {
    sending = on;
    submitBtn.disabled = on; $('back-to-input').disabled = on;
    submitBtn.querySelector('.btn__label').textContent = on ? '送信しています…' : '席を予約する';
    const sp = submitBtn.querySelector('.spinner');
    if (on && !sp) submitBtn.insertAdjacentHTML('afterbegin', '<span class="spinner" aria-hidden="true"></span>');
    if (!on && sp) sp.remove();
  }
  function showSendError(msg) {
    const box = $('send-error'); box.innerHTML = msg; box.hidden = false; box.focus();
  }

  submitBtn.addEventListener('click', async () => {
    if (sending) return; // 二重送信防止
    setSending(true);
    const data = getData();
    try {
      let res;
      if (isDemo) {
        // デモモード：GASに送らず、成功したことにする
        console.info('[デモモード] GAS_URL が未設定のため送信していません。送信予定のデータ：', data);
        await new Promise((r) => setTimeout(r, 800));
        res = { ok: true, id: 'TM-DEMO01' };
      } else {
        // Content-Type を text/plain にすると、GASでも事前確認（CORSのプリフライト）なしで受け取れる
        const r = await fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(data),
        });
        res = await r.json();
      }

      if (res.ok) {
        $('done-id').textContent = res.id;
        $('done-email').textContent = data.email;
        form.reset(); updateTotal();
        showStep('done', $('done-title'));
      } else if (res.code === 'SOLD_OUT' || res.code === 'NOT_ENOUGH') {
        showSendError(res.remaining > 0
          ? `申し訳ありません。残りの観覧席は <strong>${res.remaining}席</strong> です。「修正する」から枚数を変更してください。`
          : '申し訳ありません。有料観覧席は予定数に達したため、受付を終了しました。観覧エリアは予約なし・入場無料でご覧いただけます。');
        if (res.remaining > 0) limitSeats(res.remaining); else setSoldOut();
      } else if (res.code === 'INVALID') {
        showSendError('入力内容に不備がありました。「修正する」から内容をご確認ください。');
      } else {
        throw new Error(res.message || 'unknown');
      }
    } catch (err) {
      console.error(err);
      showSendError('通信エラーで送信できませんでした。電波の良いところで、もう一度「席を予約する」を押してください。<br>何度も失敗する場合は、お手数ですが <a href="mailto:info@toomachi-kanko.jp">info@toomachi-kanko.jp</a> までご連絡ください。');
    } finally {
      setSending(false);
    }
  });

  /* ---------- 残席の確認（ページを開いたとき） ---------- */
  function limitSeats(remaining) {
    [...$('seats').options].forEach((o) => { o.disabled = Number(o.value) > remaining; });
    if (Number($('seats').value) > remaining) { $('seats').value = String(remaining); updateTotal(); }
  }
  function setSoldOut() {
    $('soldout-notice').hidden = false;
    form.querySelectorAll('input, select, textarea, button').forEach((el) => { el.disabled = true; });
    submitBtn.disabled = true;
  }
  if (!isDemo) {
    fetch(GAS_URL)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.remaining !== 'number') return;
        if (d.remaining <= 0) setSoldOut(); else if (d.remaining < MAX_SEATS) limitSeats(d.remaining);
      })
      .catch(() => { /* 取得できなくても予約は送信時にGAS側で確認するので、ここでは何もしない */ });
  }
})();
