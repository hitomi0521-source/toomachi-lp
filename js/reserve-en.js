/* Toomachi Summer Fireworks Night: booking form (en/reserve.html)
   英語版の予約フォーム。日本語版（js/reserve.js）と同じ流れで、
   ・フリガナ欄なし ・海外の電話番号OK ・メッセージは英語 ・GASへ lang: 'en' を送る（英語の完了メールになる） */

(() => {
  /* =========================================================
     設定
     GAS_URL：js/reserve.js に入れたものと同じURL（…/exec）に差し替え
     未設定（'{GAS_URL}' のまま）のときは、通信しない「デモモード」で動きます
     ========================================================= */
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbwsJNs0xZqtgrLv4RyVAdtSVaj1BrAemhFiXIFqQ2thvYJghuRmgqFSOYeN6L6i6clB3A/exec';
  const LINE_ID = '{LINE_ID}';
  const PRICE = 1500;
  const MAX_SEATS = 6;

  const isDemo = GAS_URL.includes('{');
  const $ = (id) => document.getElementById(id);
  const yen = (n) => '¥' + n.toLocaleString('en-US');

  document.querySelectorAll('[data-line]').forEach((el) => { el.href = `https://line.me/R/ti/p/${LINE_ID}`; });

  /* ---------- Steps ---------- */
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

  /* ---------- Clean up input ---------- */
  const toHalf = (s) => s.replace(/[０-９Ａ-Ｚａ-ｚ＠．－＿＋]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[ー−‐―]/g, '-');
  ['email', 'email2'].forEach((id) => $(id).addEventListener('blur', (e) => { e.target.value = toHalf(e.target.value).trim(); }));
  // 電話：数字・+・-・スペースだけ残す（スペースは送信前に取り除く）
  $('tel').addEventListener('blur', (e) => { e.target.value = toHalf(e.target.value).replace(/[^\d+\-\s]/g, '').replace(/\s+/g, ' ').trim(); });
  const telDigits = (v) => v.replace(/[\s-]/g, '');

  /* ---------- Total ---------- */
  const updateTotal = () => { $('total-price').textContent = yen(Number($('seats').value) * PRICE); };
  $('seats').addEventListener('change', updateTotal);
  updateTotal();

  /* ---------- Validation ---------- */
  const rules = {
    seats: (v) => (Number.isInteger(+v) && +v >= 1 && +v <= MAX_SEATS) ? '' : `Please choose 1–${MAX_SEATS} people.`,
    name: (v) => v.trim() ? '' : 'Please enter your name.',
    email: (v) => !v.trim() ? 'Please enter your email.' : (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Please check your email address (e.g. emma@example.com).'),
    email2: (v) => !v.trim() ? 'Please enter your email again.' : (v.trim() === $('email').value.trim() ? '' : "The email addresses don't match."),
    tel: (v) => !v.trim() ? 'Please enter your phone number.' : (/^\+?\d{7,15}$/.test(telDigits(v)) ? '' : 'Please enter 7–15 digits. You can start with + and the country code.'),
    note: (v) => v.length <= 500 ? '' : 'Please keep it within 500 characters.',
    agree: (_, el) => el.checked ? '' : 'Please check the box to agree.',
  };
  const labels = { seats: 'People', name: 'Full name', email: 'Email', email2: 'Confirm email', tel: 'Phone', note: 'Questions or requests', agree: 'Agreement' };

  function validateField(id) {
    const el = $(id);
    const msg = rules[id](el.value, el);
    $(`${id}-error`).textContent = msg;
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    return msg;
  }
  Object.keys(rules).forEach((id) => {
    const ev = id === 'agree' || id === 'seats' ? 'change' : 'input';
    $(id).addEventListener(ev, () => { if ($(id).getAttribute('aria-invalid') === 'true') validateField(id); });
    if (!['agree', 'seats'].includes(id)) $(id).addEventListener('blur', () => { if ($(id).value) validateField(id); });
  });

  /* ---------- STEP 1 → STEP 2 ---------- */
  const form = $('reserve-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ['email', 'email2', 'tel'].forEach((id) => $(id).dispatchEvent(new Event('blur')));
    const errors = Object.keys(rules).map((id) => [id, validateField(id)]).filter(([, m]) => m);
    const box = $('error-summary');
    if (errors.length) {
      box.innerHTML = `Please check the following (${errors.length})<ul>` +
        errors.map(([id, m]) => `<li><a href="#${id}">${labels[id]}: ${m}</a></li>`).join('') + '</ul>';
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

  /* ---------- Confirm ---------- */
  const getData = () => ({
    lang: 'en', // GAS側で英語の完了メールを送る・フリガナを求めない
    seats: Number($('seats').value),
    name: $('name').value.trim(),
    kana: '',
    email: $('email').value.trim(),
    tel: telDigits($('tel').value.trim()),
    note: $('note').value.trim(),
    website: $('website').value,
  });
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function renderConfirm() {
    const d = getData();
    const rows = [
      ['Date', 'A Saturday in mid-August, 19:30–20:30 (planned)'], ['Seat type', 'Reserved seating'],
      ['People', d.seats === 1 ? '1 person' : `${d.seats} people`],
      ['Full name', d.name], ['Email', d.email], ['Phone', d.tel],
      ['Questions', d.note || '(none)'],
    ];
    $('confirm-list').innerHTML = rows.map(([k, v]) => `<div class="summary-row"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
    $('confirm-total').textContent = yen(d.seats * PRICE);
  }
  $('back-to-input').addEventListener('click', () => showStep('input', $('seats')));

  /* ---------- Send ---------- */
  const submitBtn = $('submit-btn');
  let sending = false;
  function setSending(on) {
    sending = on;
    submitBtn.disabled = on; $('back-to-input').disabled = on;
    submitBtn.querySelector('.btn__label').textContent = on ? 'Sending…' : 'Reserve my seats';
    const sp = submitBtn.querySelector('.spinner');
    if (on && !sp) submitBtn.insertAdjacentHTML('afterbegin', '<span class="spinner" aria-hidden="true"></span>');
    if (!on && sp) sp.remove();
  }
  function showSendError(msg) {
    const box = $('send-error'); box.innerHTML = msg; box.hidden = false; box.focus();
  }

  submitBtn.addEventListener('click', async () => {
    if (sending) return;
    setSending(true);
    const data = getData();
    try {
      let res;
      if (isDemo) {
        console.info('[Demo mode] GAS_URL is not set, so nothing was sent. Data:', data);
        await new Promise((r) => setTimeout(r, 800));
        res = { ok: true, id: 'TM-DEMO01' };
      } else {
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
          ? `Sorry, only <strong>${res.remaining} seat${res.remaining === 1 ? '' : 's'}</strong> left. Please tap "Edit" and change the number of people.`
          : 'Sorry, reserved seats are now fully booked. You can still watch from the free area without booking.');
        if (res.remaining > 0) limitSeats(res.remaining); else setSoldOut();
      } else if (res.code === 'INVALID') {
        showSendError('Some details could not be accepted. Please tap "Edit" and check your details.');
      } else {
        throw new Error(res.message || 'unknown');
      }
    } catch (err) {
      console.error(err);
      showSendError('We couldn\'t send your booking because of a connection problem. Please try "Reserve my seats" again where the signal is good.<br>If it keeps failing, please email us at <a href="mailto:info@toomachi-kanko.jp">info@toomachi-kanko.jp</a>.');
    } finally {
      setSending(false);
    }
  });

  /* ---------- Remaining seats ---------- */
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
      .catch(() => {});
  }
})();
