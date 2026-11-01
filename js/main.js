/* とおまち 夏花火ナイト LP：動き（index.html）
   defer で読み込むので、HTMLの読み込みが終わってから実行されます */

(() => {
  /* ---------- LINEリンク（P7） ---------- */
  const LINE_ID = '{LINE_ID}'; // 公開時に公式LINEのIDへ差し替え

  document.querySelectorAll('[data-line]').forEach((el) => {
    el.href = `https://line.me/R/ti/p/${LINE_ID}`;
  });
  document.querySelectorAll('[data-facility]').forEach((el) => {
    const text = `${el.dataset.facility}について相談したいです`;
    el.href = `https://line.me/R/oaMessage/${LINE_ID}/?text=${encodeURIComponent(text)}`;
  });

  /* ---------- FV背景動画 ----------
     ・「視差効果を減らす」設定や、通信量節約（Save-Data）のときは読み込まない
     ・画面幅で スマホ用／PC用 を選ぶ。読み込めなければ写真のまま
     ・FVが画面外に出たら止めて、電池と通信を節約 */
  (() => {
    const video = document.querySelector('.fv__video');
    const btn = document.querySelector('.fv__motion');
    if (!video) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = navigator.connection && navigator.connection.saveData;
    if (reduce || saveData) return;

    const isPc = window.matchMedia('(min-width: 1024px)').matches;
    video.src = isPc ? video.dataset.srcPc : video.dataset.srcSp;
    video.preload = 'auto';
    let userPaused = false;

    video.addEventListener('canplay', () => {
      video.classList.add('is-ready');
      btn.hidden = false;
      if (!userPaused) video.play().catch(() => {});
    }, { once: true });
    video.addEventListener('error', () => { video.remove(); }, { once: true }); // ファイルがなければ写真のまま

    btn.addEventListener('click', () => {
      userPaused = !video.paused;
      if (userPaused) video.pause(); else video.play().catch(() => {});
      btn.setAttribute('aria-pressed', String(userPaused));
      btn.querySelector('.visually-hidden').textContent = userPaused ? '背景の動画を再生' : '背景の動画を一時停止';
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        if (userPaused || !video.classList.contains('is-ready')) return;
        if (entry.isIntersecting) video.play().catch(() => {}); else video.pause();
      }).observe(document.getElementById('fv'));
    }
  })();

  /* ---------- アニメーション ----------
     「視差効果を減らす」設定のときは何もしない（CSS側でも動きを止めて、最初から表示） */
  (() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) {
      document.documentElement.classList.remove('js'); // 隠した状態を解除して全部表示
      return;
    }

    /* A：FVタイトルを1文字ずつに分ける（読み上げ用に見出し全体の名前を付けておく） */
    const title = document.querySelector('.fv__name');
    if (title) {
      title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ''));
      let i = 0;
      const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const frag = document.createDocumentFragment();
        [...node.textContent].forEach((ch) => {
          if (!ch.trim()) { frag.append(ch); return; }
          const span = document.createElement('span');
          span.className = 'char';
          span.setAttribute('aria-hidden', 'true');
          span.style.setProperty('--i', i++);
          span.textContent = ch;
          frag.append(span);
        });
        node.replaceWith(frag);
      });
    }

    /* F：スクロールでふわっと。同じ親の中で順番に少しずつ遅らせる */
    const targets = document.querySelectorAll([
      'main > section:not(.fv) .section-label', 'main > section:not(.fv) .section-title',
      '.moyamoya__item', '.point', '.voice-bubble', '.event__table', '.plan',
      '.timeline__text', '.feel__collage', '.feel__item', '.stay-card', '.stay__price', '.stay__cta',
      '.eat-item', '.voices', '.faq__item', '.final-cta__lead', '.access__map', '.access__list',
    ].join(','));
    targets.forEach((el) => {
      const siblings = [...el.parentElement.children].filter((c) => c.matches('[data-reveal]'));
      el.dataset.reveal = '';
      el.style.setProperty('--stagger', Math.min(siblings.length, 4));
    });
    const revealIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-revealed');
        revealIO.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    targets.forEach((el) => revealIO.observe(el));

    /* C：ともりんの吹き出し／G：スタンプ ─ 画面に入ったら1回だけ */
    const onceIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-inview');
        onceIO.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -15% 0px' });
    document.querySelectorAll('.tomorin:not(.fv__tomorin), .stamps').forEach((el) => onceIO.observe(el));

    /* D：タイムラインの点線を、スクロールに合わせて伸ばす */
    const timeline = document.querySelector('.timeline');
    if (timeline) {
      const times = [...timeline.querySelectorAll('.timeline__time')];
      const shots = [...timeline.querySelectorAll('[data-shot]')];
      let ticking = false;
      const draw = () => {
        ticking = false;
        const tip = window.innerHeight * 0.62;            // 画面の上から62%の位置まで線が伸びる
        const r = timeline.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (tip - r.top) / r.height));
        timeline.style.setProperty('--p', p.toFixed(4));
        times.forEach((t) => {
          const tr = t.getBoundingClientRect();
          t.classList.toggle('is-lit', tr.top + tr.height / 2 < tip);
        });
        // 点線の先が写真の上端に届いたら、その写真の出方で表示（一度出たらそのまま）
        shots.forEach((el) => {
          if (!el.classList.contains('is-shown') && el.getBoundingClientRect().top < tip) el.classList.add('is-shown');
        });
      };
      const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(draw); } };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      draw();
    }
  })();

  /* ---------- FAQアコーディオン ---------- */
  document.querySelectorAll('.faq__q').forEach((btn) => {
    btn.addEventListener('click', () => {
      const answer = document.getElementById(btn.getAttribute('aria-controls'));
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      answer.hidden = isOpen;
    });
  });

  /* ---------- 追従CTAバー（P3） ----------
     ・FVのCTAが見えている間は非表示（同じボタンが2組並ぶのを防ぐ）
     ・最終CTAセクションが画面に入ったら、それ以降（NEXT SUMMER／ACCESS／フッター）も非表示 */
  const bar = document.getElementById('sticky-bar');
  const fvCta = document.getElementById('fv-cta');
  const finalCta = document.getElementById('final-cta');
  if (!bar || !('IntersectionObserver' in window)) {
    bar && bar.classList.remove('is-hidden');
    return;
  }

  let fvCtaVisible = true;
  let reachedFinal = false;
  const update = () => {
    bar.classList.toggle('is-hidden', fvCtaVisible || reachedFinal);
  };

  new IntersectionObserver(([entry]) => {
    fvCtaVisible = entry.isIntersecting;
    update();
  }).observe(fvCta);

  // 最終CTA〜フッターまでの各要素を監視（ページ内リンク等で一気に飛んだ場合も検知できるように）
  const afterFinal = [finalCta, ...document.querySelectorAll('#next-summer, #access, .site-footer')];
  const visible = new Set();
  // いずれかが画面内にある、または最終CTAより下までスクロール済みなら「到達済み」
  const finalObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target);
    });
    reachedFinal = visible.size > 0 || finalCta.getBoundingClientRect().top < 0;
    update();
  });
  afterFinal.forEach((el) => finalObserver.observe(el));
})();
