/* ==========================================================================
   scenes.js — сцены ролика. scene1() … scene7() возвращают gsap.timeline().
   Время внутри функций — ЛОКАЛЬНОЕ (от начала сцены). Абсолютные начала
   сцен лежат в Scenes.START и используются main.js для меток мастер-таймлайна.

   Правила, чтобы перемотка работала в обе стороны:
   • начальное состояние всех элементов выставляется ОДИН раз в Scenes.build();
   • в таймлайнах — только .to() / .set() / fromTo(..., immediateRender:false);
   • вся «случайность» — из детерминированного генератора (seed).
   ========================================================================== */

(function () {
  'use strict';

  const D = window.AA_DATA;
  const M = D.models;
  const $ = s => document.querySelector(s);

  // Абсолютные начала сцен (секунды) — главы ролика
  const START = { intro: 0, aa: 6, chart: 15, third: 25, second: 34, first: 43, final: 54 };
  const TYPE = 0.014;   // скорость «печати» облачка, с/символ

  // Детерминированный ГПСЧ (mulberry32), чтобы эффекты были одинаковыми при перемотке
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const R = rng(20261016);
  const rr = (a, b) => a + (b - a) * R();

  // Русское склонение: 1 балл, 2 балла, 5 баллов
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  const pts = n => `${n} ${plural(n, 'балл', 'балла', 'баллов')}`;

  // ---------------------------------------------------------------------------
  // Камера (#world): зум/панорама. Математика: точка мира p → экран x + p*s.
  // ---------------------------------------------------------------------------
  const Cam = {
    // Фокус на тройке лидеров (посчитан под геометрию chart.js)
    top3() {
      const G = Chart.G;
      const rx0 = Chart.barCX(0) - 210, rx1 = Chart.barCX(2) + 60;
      const ry0 = Chart.barTopY(0) - 80, ry1 = G.cardY + G.cardH - 50;
      const box = { x: 40, y: 30, w: 940, h: 1020 };
      const s = Math.min(box.w / (rx1 - rx0), box.h / (ry1 - ry0));
      const cx = (rx0 + rx1) / 2, cy = (ry0 + ry1) / 2;
      return { scale: s, x: box.x + box.w / 2 - cx * s, y: box.y + box.h / 2 - cy * s };
    },
    toScreen(p, cam) { return { x: cam.x + p.x * cam.scale, y: cam.y + p.y * cam.scale }; }
  };

  // ---------------------------------------------------------------------------
  // Облачка с репликами
  // ---------------------------------------------------------------------------
  /**
   * say(tl, at, end, text, o)
   *  o.x, o.y — левый край и НИЖНИЙ край облачка (координаты сцены)
   *  o.w      — максимальная ширина; o.tail — 'b' | 'l' | 'r'; o.tx — позиция хвоста (%)
   *  '|' в тексте — пауза и перенос строки.
   */
  function say(tl, at, end, text, o) {
    const el = document.createElement('div');
    el.className = `bubble tail-${o.tail || 'b'}`;
    el.style.left = o.x + 'px';
    el.style.top = o.y + 'px';
    el.style.maxWidth = (o.w || 440) + 'px';
    if (o.size) el.style.fontSize = o.size + 'px';
    el.style.setProperty('--tx', (o.tx == null ? 30 : o.tx) + '%');

    const segs = text.split('|');
    const segChars = [];
    segs.forEach((seg, si) => {
      if (si) el.appendChild(document.createElement('br'));
      const chars = [];
      seg.trim().split(' ').forEach((word, wi) => {
        if (wi) el.appendChild(document.createTextNode(' '));
        const w = document.createElement('span');
        w.className = 'w';
        [...word].forEach(c => {
          const ch = document.createElement('span');
          ch.className = 'ch';
          ch.textContent = c;
          w.appendChild(ch);
          chars.push(ch);
        });
        el.appendChild(w);
      });
      segChars.push(chars);
    });
    $('#bubbles').appendChild(el);

    const origin = o.tail === 'l' ? '0% 50%' : o.tail === 'r' ? '100% 50%' : `${o.tx == null ? 30 : o.tx}% 100%`;
    gsap.set(el, { yPercent: -100, autoAlpha: 0, scale: 0.3, transformOrigin: origin });

    tl.to(el, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2.2)' }, at);
    Cues.cue(tl, at, 'bubble');
    let t = at + 0.15;
    segChars.forEach((chars, i) => {
      if (i) t += 0.25; // пауза между частями
      tl.to(chars, { opacity: 1, duration: 0.01, stagger: TYPE }, t);
      Cues.cue(tl, t, 'type', { n: chars.length, rate: TYPE });
      t += chars.length * TYPE;
    });
    // лёгкая тряска на восклицаниях
    if (o.shake || /!/.test(text)) {
      tl.to(el, { keyframes: { rotation: [0, -3, 3, -2, 2, 0] }, duration: 0.35 }, t);
    }
    tl.to(el, { autoAlpha: 0, scale: 0.85, duration: 0.2, ease: 'power2.in' }, end - 0.2);
    Cues.cue(tl, end - 0.2, 'unbubble');
    return el;
  }

  // ---------------------------------------------------------------------------
  // Эффекты (частицы создаются заранее, анимируются таймлайном)
  // ---------------------------------------------------------------------------
  function fxEl(cls, css) {
    const e = document.createElement('div');
    e.className = 'fx ' + cls;
    if (css) Object.assign(e.style, css);
    $('#fx').appendChild(e);
    gsap.set(e, { autoAlpha: 0 });
    return e;
  }

  /** Облачко пыли в точке (x, y). */
  function dust(tl, at, x, y, n = 12, spread = 160, color) {
    for (let i = 0; i < n; i++) {
      const s = rr(26, 60);
      const e = fxEl('dust', { width: s + 'px', height: s + 'px', background: color || '' });
      const dir = i % 2 ? 1 : -1;
      tl.fromTo(e, { x: x - s / 2, y: y - s / 2, autoAlpha: 0.9, scale: 0.3 }, {
        x: x - s / 2 + dir * rr(40, spread), y: y - s / 2 - rr(10, 70), scale: rr(1, 1.6),
        autoAlpha: 0, duration: rr(0.5, 0.9), ease: 'power2.out', immediateRender: false
      }, at + rr(0, 0.06));
    }
  }

  /** Искры щелчка клешнёй. */
  function sparks(tl, at, x, y, n = 8, tdx = 20, tdy = -90) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const e = fxEl('spark');
      tl.fromTo(e, { x, y, rotation: a * 180 / Math.PI, autoAlpha: 1, scaleX: 0.2 }, {
        x: x + Math.cos(a) * 70, y: y + Math.sin(a) * 70, scaleX: 1, autoAlpha: 0,
        duration: 0.35, ease: 'power2.out', immediateRender: false
      }, at);
    }
    const t = fxEl('snaptext');
    t.textContent = 'щёлк!';
    tl.fromTo(t, { x: x + tdx, y: y + tdy, autoAlpha: 1, scale: 0.4, rotation: -12 }, {
      scale: 1.1, duration: 0.25, ease: 'back.out(4)', immediateRender: false
    }, at);
    tl.to(t, { autoAlpha: 0, y: y + tdy - 40, duration: 0.3 }, at + 0.45);
  }

  const CONF = ['#FFC928', '#E8463A', '#34A853', '#0089F4', '#7C5CFF', '#FF7FA3', '#D97757', '#ffffff'];

  /** Взрыв конфетти из точки (хлопушка). */
  function confettiBurst(tl, at, ox, oy, n = 70) {
    Cues.cue(tl, at, 'pop');
    for (let i = 0; i < n; i++) {
      const w = rr(12, 22), h = rr(8, 14);
      const e = fxEl('conf', { width: w + 'px', height: h + 'px', background: CONF[i % CONF.length] });
      const d = rr(1.6, 2.6);
      const dx = rr(-1250, 150), up = rr(260, 720);
      tl.fromTo(e, { x: ox, y: oy, rotation: 0, autoAlpha: 1 }, {
        x: ox + dx, rotation: rr(-900, 900), duration: d, ease: 'power1.out', immediateRender: false
      }, at);
      tl.to(e, { y: oy - up, duration: d * 0.35, ease: 'power2.out' }, at);
      tl.to(e, { y: oy - up + rr(500, 900), duration: d * 0.65, ease: 'power1.in' }, at + d * 0.35);
      tl.to(e, { autoAlpha: 0, duration: 0.3 }, at + d - 0.3);
    }
  }

  /** Конфетти-дождь сверху. */
  function confettiRain(tl, at, n = 70, dur = 1.4) {
    Cues.cue(tl, at, 'sparkle', { dur: dur + 2.5 });
    for (let i = 0; i < n; i++) {
      const w = rr(12, 20), h = rr(8, 14);
      const e = fxEl('conf', { width: w + 'px', height: h + 'px', background: CONF[(i + 3) % CONF.length] });
      const x = rr(0, 1920), t = at + rr(0, dur), d = rr(2.4, 3.6);
      tl.fromTo(e, { x, y: -40, rotation: rr(0, 180), autoAlpha: 1 }, {
        x: x + rr(-160, 160), y: 1140, rotation: rr(400, 1400), duration: d, ease: 'none',
        immediateRender: false
      }, t);
    }
  }

  /** Спидлайны (для «смахивания»). */
  function speedlines(tl, at, n = 16) {
    Cues.cue(tl, at, 'whoosh', { dur: 0.45 });
    for (let i = 0; i < n; i++) {
      const w = rr(300, 900);
      const e = fxEl('speed', { width: w + 'px' });
      const y = rr(80, 1000);
      tl.fromTo(e, { x: 1950, y, autoAlpha: 0.9 }, {
        x: -w - 60, duration: rr(0.28, 0.45), ease: 'power1.in', immediateRender: false
      }, at + rr(0, 0.18));
    }
  }

  /** Тряска камеры. */
  function shake(tl, at, amp = 12, dur = 0.35) {
    Cues.cue(tl, at, 'impact', { amp, dur });
    tl.to('#stageInner', {
      keyframes: { x: [0, -amp, amp * 0.8, -amp * 0.6, amp * 0.4, 0], y: [0, amp * 0.5, -amp * 0.6, amp * 0.4, -amp * 0.2, 0] },
      duration: dur, ease: 'none'
    }, at);
  }

  // ---------------------------------------------------------------------------
  // Иконки бенчмарков (свои простые SVG)
  // ---------------------------------------------------------------------------
  const L = '#3B1E14';
  const ICONS = {
    case: `<rect x="8" y="22" width="48" height="32" rx="6" fill="#D97757" stroke="${L}" stroke-width="4"/><path d="M24 22v-6h16v6M8 35h48" fill="none" stroke="${L}" stroke-width="4"/>`,
    chart: `<path d="M8 56h48" stroke="${L}" stroke-width="4"/><rect x="12" y="36" width="10" height="20" fill="#FFC928" stroke="${L}" stroke-width="3.5"/><rect x="27" y="24" width="10" height="32" fill="#34A853" stroke="${L}" stroke-width="3.5"/><rect x="42" y="12" width="10" height="44" fill="#0089F4" stroke="${L}" stroke-width="3.5"/>`,
    gear: `<circle cx="32" cy="32" r="21" fill="none" stroke="${L}" stroke-width="9" stroke-dasharray="7 6"/><circle cx="32" cy="32" r="16" fill="#7C5CFF" stroke="${L}" stroke-width="4"/><circle cx="32" cy="32" r="6" fill="#fff" stroke="${L}" stroke-width="3"/>`,
    term: `<rect x="5" y="12" width="54" height="40" rx="6" fill="#2E2E3A" stroke="${L}" stroke-width="4"/><path d="M15 25l9 7-9 7M29 41h14" fill="none" stroke="#7CFFB2" stroke-width="4" stroke-linecap="round"/>`,
    flask: `<path d="M25 8h14M28 8v17L14 50a4 4 0 0 0 4 6h28a4 4 0 0 0 4-6L36 25V8" fill="#B8F0C8" stroke="${L}" stroke-width="4" stroke-linejoin="round"/><path d="M19 44h26" stroke="#34A853" stroke-width="6"/>`,
    cap: `<path d="M32 12l28 13-28 13L4 25z" fill="#2E2E3A" stroke="${L}" stroke-width="4" stroke-linejoin="round"/><path d="M16 31v12q16 10 32 0V31" fill="#4A4A5C" stroke="${L}" stroke-width="4"/><path d="M57 26v15" stroke="#FFC928" stroke-width="4" stroke-linecap="round"/>`,
    doc: `<path d="M14 6h25l12 12v40H14z" fill="#fff" stroke="${L}" stroke-width="4" stroke-linejoin="round"/><path d="M39 6v12h12M21 28h22M21 37h22M21 46h14" fill="none" stroke="${L}" stroke-width="3.5"/>`,
    atom: `<g fill="none" stroke="#0089F4" stroke-width="4"><ellipse cx="32" cy="32" rx="26" ry="9"/><ellipse cx="32" cy="32" rx="26" ry="9" transform="rotate(60 32 32)"/><ellipse cx="32" cy="32" rx="26" ry="9" transform="rotate(120 32 32)"/></g><circle cx="32" cy="32" r="6" fill="#E8463A" stroke="${L}" stroke-width="3"/>`,
    brain: `<path d="M32 12c-8-6-20 0-18 9-8 3-8 14 0 17-2 9 10 14 18 9 8 5 20 0 18-9 8-3 8-14 0-17 2-9-10-15-18-9z" fill="#FF9DB3" stroke="${L}" stroke-width="4" stroke-linejoin="round"/><path d="M32 13v42M22 26q6 3 0 8M42 26q-6 3 0 8" fill="none" stroke="${L}" stroke-width="3"/>`,
    scroll: `<rect x="12" y="10" width="40" height="44" rx="4" fill="#F5E6C8" stroke="${L}" stroke-width="4"/><path d="M19 22h26M19 30h26M19 38h26M19 46h16" stroke="${L}" stroke-width="3"/><circle cx="12" cy="10" r="5" fill="#D97757" stroke="${L}" stroke-width="3"/><circle cx="52" cy="54" r="5" fill="#D97757" stroke="${L}" stroke-width="3"/>`
  };

  // ---------------------------------------------------------------------------
  // Карточки мест
  // ---------------------------------------------------------------------------
  const CARD = { x: 1000, y: 150, w: 460 };
  const counters = [];   // [{el, to, start, dur}] — считаются в main.js

  function fillCard(rank) {
    const m = M[rank - 1];
    const lab = D.labs[m.lab];
    const tie = M.slice(0, 3).find(o => o !== m && o.score === m.score);
    const el = $('#card' + rank);
    el.innerHTML = `
      <div class="c-place c-place-${rank}">${rank} МЕСТО</div>
      <div class="c-name">${m.name}</div>
      ${m.variant ? `<div class="c-var">${m.variant}</div>` : ''}
      <div class="c-lab"><i style="background:${lab.color}"></i>Разработчик: <b>${m.lab}</b></div>
      <div class="c-score"><span class="c-num">0</span><span class="c-unit">${plural(m.score, 'балл', 'балла', 'баллов')}<br>Intelligence Index</span></div>
      ${tie ? `<div class="c-tie">столько же, сколько у №${tie.rank} — на сайте при равенстве они стоят в таком порядке</div>` : ''}
      <ul class="c-facts">${D.facts[rank].map(f => `<li>${f}</li>`).join('')}</ul>
      ${rank === 1 ? '<div class="c-shine"></div>' : ''}`;
    Object.assign(el.style, { left: CARD.x + 'px', top: CARD.y + 'px', width: CARD.w + 'px' });
    return el;
  }

  // ---------------------------------------------------------------------------
  // Статическое построение DOM + начальные состояния
  // ---------------------------------------------------------------------------
  const Scenes = {
    START, counters, Cam,

    build() {
      // --- Сцена 2: карточки бенчмарков (5 × 2) ---
      const bc = $('#benchCards');
      D.benchmarks.forEach((b, i) => {
        const c = document.createElement('div');
        c.className = 'bc';
        const col = i % 5, row = Math.floor(i / 5);
        Object.assign(c.style, { left: (600 + col * 256) + 'px', top: (250 + row * 200) + 'px' });
        c.innerHTML = `<svg viewBox="0 0 64 64" width="64" height="64">${ICONS[b.icon]}</svg>
          <div class="bc-name">${b.name}</div><div class="bc-ru">${b.ru}</div>`;
        bc.appendChild(c);
      });
      // карточки «вылетают веером» из указки крабика
      gsap.utils.toArray('.bc').forEach((c, i) => {
        const col = i % 5, row = Math.floor(i / 5);
        gsap.set(c, {
          x: 440 - (600 + col * 256), y: 640 - (250 + row * 200),
          rotation: -40 + i * 8, scale: 0.2, autoAlpha: 0
        });
      });
      gsap.set('.s2-formula .f-chip, .s2-formula .f-arrow', { autoAlpha: 0, scale: 0.4 });

      // --- Сцена 1 ---
      gsap.set('#s1Title .t-top', { y: -500 });
      gsap.set('#s1Title .t-mid', { scale: 0, rotation: -8 });
      gsap.set('#s1Title .t-sub', { autoAlpha: 0, y: 30 });

      // --- Слои сцен ---
      gsap.set(['#s2', '#s3', '#s7'], { autoAlpha: 0 });
      gsap.set('#world', { x: 0, y: 0, scale: 1, transformOrigin: '0 0' });

      // --- Карточки мест ---
      const cam = Cam.top3();
      [3, 2, 1].forEach(r => fillCard(r));
      const b3 = Cam.toScreen({ x: Chart.barCX(2), y: Chart.barTopY(2) + 150 }, cam);
      gsap.set('#card3', { autoAlpha: 0, scale: 0.1, x: b3.x - (CARD.x + CARD.w / 2), y: b3.y - (CARD.y + 300), transformOrigin: '50% 50%' });
      gsap.set('#card2', { autoAlpha: 0, y: -1000, rotation: 4 });
      gsap.set('#card1', { autoAlpha: 0, scale: 0.2, rotation: -6 });
      gsap.set('#card1 .c-shine', { xPercent: -150 });

      // --- Подсветка столбцов ---
      gsap.set('.bar', { boxShadow: '0 0 0 0px rgba(255,216,77,0), 0 0 0px 0px rgba(255,216,77,0)' });

      // --- Медали над столбцами №2 и №3 ---
      Chart.bars[1].medal.textContent = '2';
      Chart.bars[1].medal.classList.add('medal-2');
      Chart.bars[2].medal.textContent = '3';
      Chart.bars[2].medal.classList.add('medal-3');

      // --- Маркер разрыва «№1 vs №8» ---
      this.buildGapMarker();

      // --- Затемнение + прожектор ---
      gsap.set('#dim', { autoAlpha: 0, scale: 3, x: 1500 - 640, y: 300 - 360, transformOrigin: '50% 50%' });
      const b1 = Cam.toScreen({ x: Chart.barCX(0), y: Chart.barTopY(0) }, cam);
      const base = Cam.toScreen({ x: 0, y: Chart.baseWorldY() }, cam);
      this.spot = { x: b1.x, top: b1.y, base: base.y };
      Object.assign($('#spotCone').style, { left: (b1.x - 260) + 'px' });
      gsap.set('#spotCone', { autoAlpha: 0, scaleY: 0, transformOrigin: '50% 0%' });

      // --- Барабан ---
      $('#drum').innerHTML = `<svg viewBox="0 0 200 130" width="200" height="130">
        <ellipse cx="100" cy="104" rx="88" ry="20" fill="#B5302A" stroke="${L}" stroke-width="6"/>
        <rect x="12" y="34" width="176" height="70" fill="#E8463A" stroke="${L}" stroke-width="6"/>
        <path d="M12 40 L56 100 L100 40 L144 100 L188 40" fill="none" stroke="#FFC928" stroke-width="6" stroke-linejoin="round"/>
        <ellipse cx="100" cy="34" rx="88" ry="20" fill="#FFF4E0" stroke="${L}" stroke-width="6"/>
      </svg>`;
      gsap.set('#drum', { autoAlpha: 0, scale: 0.3, transformOrigin: '50% 100%' });

      // --- Пиксельный переход: сетка 16×9 ---
      const tr = $('#transitions');
      const tileColors = ['#D97757', '#F4A988', '#FFE3C7', '#BF5F40', '#FFC928'];
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 16; c++) {
          const t = document.createElement('div');
          t.className = 'tile';
          Object.assign(t.style, { left: c * 120 + 'px', top: r * 120 + 'px', background: tileColors[(r * 7 + c * 3) % tileColors.length] });
          tr.appendChild(t);
        }
      }
      gsap.set('.tile', { scale: 0, rotation: 45 });

      // --- Сцена 7 ---
      gsap.set('#s7L1', { autoAlpha: 0, y: 60, scale: 0.6 });
      gsap.set('#s7L2', { autoAlpha: 0, y: 60 });

      // --- Подпись источника ---
      $('#footer').textContent =
        `Данные: ${D.indexName} ${D.indexVersion} · ${D.date} · ${D.sourceUrl}`;
      gsap.set('#footer', { autoAlpha: 0 });
      gsap.set('#stageInner', { clipPath: 'circle(1500px at 596px 694px)' });
    },

    /** Скобка «от №1 до №8 — N баллов» поверх диаграммы. */
    buildGapMarker() {
      const G = Chart.G;
      const plot = document.querySelector('.ch-plot');
      const y1 = G.baseY - M[0].score * G.pxPerPoint;
      const y8 = G.baseY - M[7].score * G.pxPerPoint;
      const xL = G.plotX + 10, xR = G.plotX + G.slot * 8 + 6;
      const gap = M[0].score - M[7].score;
      const g = document.createElement('div');
      g.className = 'gap-mark';
      g.innerHTML = `
        <div class="gm-line" style="left:${xL}px; top:${y1}px; width:${xR - xL}px"></div>
        <div class="gm-line" style="left:${xR - 120}px; top:${y8}px; width:120px"></div>
        <div class="gm-arrow" style="left:${xR}px; top:${y1}px; height:${y8 - y1}px"></div>
        <div class="gm-label" style="left:${xR + 18}px; top:${(y1 + y8) / 2 - 24}px">${pts(gap)}</div>`;
      plot.appendChild(g);
      gsap.set(g, { autoAlpha: 0 });
      this.gapMark = g;
      this.gap = gap;
    },

    // =========================================================================
    // СЦЕНА 1 (0–6 с): интро
    // =========================================================================
    scene1() {
      const tl = gsap.timeline();
      const st = { cx: 960, feetY: 1030, scale: 1.15 };

      tl.to('#s1 .sunburst', { rotation: 30, duration: 7, ease: 'none' }, 0);

      // выпрыгивает из-под нижнего края
      Crab.place(tl, 0, st.cx, 1500, st.scale);
      Crab.emote(tl, 0, 'surprised');
      tl.to(Crab.el, { y: 720 - Crab.H, duration: 0.4, ease: 'power2.out' }, 0.2);
      tl.to(Crab.el, { y: st.feetY - Crab.H, duration: 0.3, ease: 'power2.in' }, 0.6);
      Crab.land(tl, 0.9);
      dust(tl, 0.9, st.cx, st.feetY, 14, 260);
      shake(tl, 0.9, 8, 0.25);

      // отряхивается
      Crab.emote(tl, 1.0, 'happy');
      tl.to(Crab.el, { keyframes: { rotation: [0, -9, 9, -7, 7, -4, 0] }, duration: 0.6, ease: 'none' }, 1.05);
      dust(tl, 1.15, st.cx - 160, st.feetY - 200, 5, 120, '#F3D9B1');
      dust(tl, 1.3, st.cx + 160, st.feetY - 200, 5, 120, '#F3D9B1');

      // щёлкает клешнями
      Crab.snap(tl, 1.7, 'both', 2);
      const cR = Crab.toStage(Crab.PT.tipR, st), cL = Crab.toStage(Crab.PT.tipL, st);
      sparks(tl, 1.75, cR.x + 10, cR.y - 30, 8, -170, -150);
      sparks(tl, 1.93, cL.x - 10, cL.y - 30, 6, 40, -150);

      // заголовок вылетает с отскоком
      tl.to('#s1Title .t-top', { y: 0, duration: 0.9, ease: 'bounce.out' }, 0.7);
      Cues.cue(tl, 0.7, 'titlebounce', { dur: 0.9 });
      Cues.cue(tl, 1.3, 'boing');
      tl.to('#s1Title .t-mid', { scale: 1, rotation: -3, duration: 0.8, ease: 'elastic.out(1, 0.45)' }, 1.3);
      tl.to('#s1Title .t-sub', { autoAlpha: 1, y: 0, duration: 0.4, ease: 'back.out(2)' }, 1.8);

      // реплики
      say(tl, 1.25, 2.95, 'Привет! Я Claude.', { x: 1245, y: 830, w: 520, tail: 'l' });
      say(tl, 3.0, 5.85, 'Сегодня разберёмся, кто из ИИ самый умный…|Спойлер: это будет неловко.', { x: 1245, y: 850, w: 600, tail: 'l' });
      Crab.emote(tl, 3.0, 'normal');
      Crab.look(tl, 3.0, 6, -4);
      Crab.emote(tl, 3.95, 'sly');

      // бежит к правому краю — схватить «шторку»
      Crab.emote(tl, 5.85, 'happy');
      Crab.walk(tl, 5.9, 1724, st.feetY, 0.3, { scale: 1.0 });
      return tl;
    },

    // =========================================================================
    // СЦЕНА 2 (6–15 с): что такое Artificial Analysis
    // =========================================================================
    scene2() {
      const tl = gsap.timeline();
      const st = { cx: 280, feetY: 1040, scale: 1 };

      // ПЕРЕХОД «шторка»: крабик утаскивает экран сцены 1 клешнёй
      tl.set('#s2', { autoAlpha: 1 }, 0);
      tl.set('#s1', { boxShadow: '30px 0 50px rgba(59,30,20,.35)' }, 0);
      Crab.snap(tl, 0.1, 'R', 1);
      tl.to('#s1', { x: (st.cx + 196) - 1920, duration: 0.85, ease: 'power1.inOut' }, 0.2);
      Cues.cue(tl, 0.2, 'curtain', { dur: 0.85 });
      Cues.cue(tl, 1.05, 'whoosh', { dur: 0.25 });
      Crab.walk(tl, 0.2, st.cx, st.feetY, 0.85, { ease: 'power1.inOut' });
      tl.to('#s1', { x: -1980, duration: 0.25, ease: 'power2.in' }, 1.05);
      tl.set('#s1', { autoAlpha: 0 }, 1.3);

      // реквизит: очки и указка
      Crab.emote(tl, 1.1, 'normal');
      Crab.prop(tl, 1.1, 'glasses');
      Crab.prop(tl, 1.35, 'pointer');
      Crab.look(tl, 1.1, 8, -2);

      say(tl, 1.1, 3.6, 'Они независимые: тестируют модели сами, а не верят на слово.',
        { x: 40, y: 640, w: 500, tail: 'b', tx: 45 });

      // 10 тестов вылетают веером из указки
      tl.to('.bc', {
        x: 0, y: 0, rotation: (i) => (i % 2 ? 2.5 : -2.5), scale: 1, autoAlpha: 1,
        duration: 0.6, ease: 'back.out(1.7)', stagger: 0.11
      }, 2.4);
      D.benchmarks.forEach((b, i) => Cues.cue(tl, 2.4 + i * 0.11, 'card', { i }));
      Crab.arm(tl, 2.3, 'R', 12, 0.3);
      Crab.arm(tl, 3.5, 'R', 0, 0.3);

      say(tl, 3.7, 5.95, 'А Intelligence Index — их сводный балл по всем 10 тестам.',
        { x: 40, y: 640, w: 500, tail: 'b', tx: 45 });
      tl.to('.s2-formula .f-chip, .s2-formula .f-arrow', {
        autoAlpha: 1, scale: 1, duration: 0.45, ease: 'back.out(3)', stagger: 0.12
      }, 4.0);
      for (let i = 0; i < 5; i++) Cues.cue(tl, 4.0 + i * 0.12, 'chip', { i });
      tl.to('.s2-formula .f-main', { scale: 1.12, duration: 0.25, yoyo: true, repeat: 1 }, 4.8);
      Crab.prop(tl, 5.9, 'pointer', false);

      // шутка
      Crab.emote(tl, 6.0, 'sly');
      say(tl, 6.0, 8.9, 'Это как ЕГЭ, только для нейросетей.|И списать нельзя — я проверял.',
        { x: 40, y: 640, w: 520, tail: 'b', tx: 45 });
      Crab.emote(tl, 7.0, 'shy');
      Crab.look(tl, 7.0, -8, 4);
      Crab.prop(tl, 8.6, 'glasses', false);
      return tl;
    },

    // =========================================================================
    // СЦЕНА 3 (15–25 с): диаграмма
    // =========================================================================
    scene3(absStart) {
      const tl = gsap.timeline();
      const eye = Crab.toStage(Crab.PT.eyeR, { cx: 280, feetY: 1040, scale: 1 });

      // ПЕРЕХОД: круговая маска «из глаза» крабика
      tl.set('#s3', { autoAlpha: 1, clipPath: `circle(0px at ${eye.x}px ${eye.y}px)` }, 0);
      tl.to('#cr-eyeR', { scale: 1.4, duration: 0.15, yoyo: true, repeat: 1, transformOrigin: '50% 50%' }, 0);
      tl.to('#s3', { clipPath: `circle(2300px at ${eye.x}px ${eye.y}px)`, duration: 0.75, ease: 'power2.in' }, 0.1);
      Cues.cue(tl, 0.1, 'iris', { dur: 0.75 });
      tl.set('#s3', { clipPath: 'none' }, 0.86);
      tl.set('#s2', { autoAlpha: 0 }, 0.86);

      // крабик спрыгивает вниз, к оси
      Crab.emote(tl, 0.3, 'happy');
      Crab.look(tl, 0.3, 0, 0);
      Crab.hop(tl, 0.35, 150, 1072, 930, { scale: 0.5, dur: 0.5 });
      Crab.prop(tl, 0.6, 'mic');

      // столбики растут по очереди, счётчики набегают
      Chart.grow(tl, 0.9, 0.32, absStart, counters);
      // …а крабик бежит боком вдоль оси
      Crab.walk(tl, 1.0, 1400, 1072, 3.4, { ease: 'none' });
      Crab.hop(tl, 4.5, 1720, 1050, 900, { scale: 0.8, dur: 0.55 });

      const B = { x: 1490, y: 760, w: 410, tail: 'b', tx: 55 };
      say(tl, 0.95, 3.3, 'Вот он — рейтинг! Столбик — модель, цвет — лаборатория.', B);
      say(tl, 3.4, 5.6, 'Клетчатый столбик — у модели нет публичного API.', B);
      tl.to(Chart.bars[2].bar, { scaleX: 1.12, duration: 0.2, yoyo: true, repeat: 3, ease: 'sine.inOut' }, 4.2);

      // разрыв в топе
      Crab.emote(tl, 5.7, 'happy');
      Crab.look(tl, 5.7, -10, -6);
      tl.to(this.gapMark, { autoAlpha: 1, duration: 0.3 }, 5.8);
      Cues.cue(tl, 5.9, 'gap');
      tl.fromTo(this.gapMark.querySelector('.gm-label'), { scale: 0 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', immediateRender: false }, 5.9);
      say(tl, 5.7, 8.1, `От №1 до №8 — всего ${pts(this.gap)}. Толкучка, как в метро в час пик!`, B);
      tl.to(this.gapMark, { autoAlpha: 0, duration: 0.3 }, 7.9);

      // ПЕРЕХОД: зум в тройку лидеров, остальные тускнеют
      Crab.prop(tl, 8.0, 'mic', false);
      Crab.emote(tl, 8.2, 'normal');
      say(tl, 8.2, 10.1, 'Приближаю тройку лидеров…', B);
      const cam = Cam.top3();
      tl.to('#world', { x: cam.x, y: cam.y, scale: cam.scale, duration: 2.0, ease: 'power2.inOut' }, 8.0);
      Cues.cue(tl, 8.0, 'riser', { dur: 2.0 });
      tl.to(Chart.bars.slice(3).map(b => b.col), { opacity: 0.18, duration: 1.0 }, 8.1);
      tl.to(['.ch-legend', '.ch-sub', '.ch-title', '.ch-src'], { opacity: 0.25, duration: 1.0 }, 8.1);
      return tl;
    },

    // =========================================================================
    // СЦЕНА 4 (25–34 с): 3 место
    // =========================================================================
    scene4(absStart) {
      const tl = gsap.timeline();
      const B = { x: 1490, y: 800, w: 410, tail: 'b', tx: 55 };
      const bar3 = Chart.bars[2];

      // барабанная дробь
      Object.assign($('#drum').style, { left: '1620px', top: '955px' });
      tl.to('#drum', { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(3)' }, 0);
      Crab.prop(tl, 0, 'sticks');
      Crab.emote(tl, 0, 'sly');
      say(tl, 0.1, 1.9, 'Барабанная дробь…', B);
      tl.to('#cr-armR', { rotation: -9, duration: 0.05, yoyo: true, repeat: 25, ease: 'none' }, 0.35);
      Cues.cue(tl, 0.35, 'drumroll', { dur: 1.45 });
      Cues.cue(tl, 1.8, 'crash');
      tl.to('#cr-armL', { rotation: -9, duration: 0.05, yoyo: true, repeat: 25, ease: 'none' }, 0.4);
      tl.to('#drum', { scaleY: 0.94, duration: 0.05, yoyo: true, repeat: 25, ease: 'none' }, 0.35);
      shake(tl, 0.6, 3, 1.0);

      // столбик №3 подсвечивается
      tl.to([Chart.bars[0].col, Chart.bars[1].col], { opacity: 0.45, duration: 0.3 }, 1.8);
      tl.to(bar3.bar, { boxShadow: '0 0 0 7px rgba(255,216,77,1), 0 0 60px 14px rgba(255,216,77,.9)', duration: 0.3 }, 1.8);
      tl.to(bar3.medal, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(3)' }, 1.85);
      Cues.cue(tl, 1.85, 'medal', { rank: 3 });
      Cues.cue(tl, 1.9, 'reveal', { rank: 3 });

      // карточка вылезает из столбика
      tl.to('#card3', { autoAlpha: 1, scale: 1, x: 0, y: 0, duration: 0.7, ease: 'back.out(1.5)' }, 1.9);
      counters.push({ el: $('#card3 .c-num'), to: M[2].score, start: absStart + 2.1, dur: 0.9 });
      Cues.cue(tl, 2.1, 'count', { to: M[2].score, dur: 0.9 });
      tl.to('#drum', { autoAlpha: 0, scale: 0.3, duration: 0.25 }, 2.0);
      Crab.prop(tl, 2.0, 'sticks', false);
      Crab.arm(tl, 2.0, 'both', 0, 0.2);

      // вежливо аплодирует
      Crab.emote(tl, 2.3, 'happy');
      Crab.look(tl, 2.3, -10, -2);
      Crab.clap(tl, 2.4, 4);
      say(tl, 2.6, 5.3, `Браво, ${M[2].lab}! В физике (CritPt) — лучшая на всём графике.`, B);

      // добрая шутка
      Crab.emote(tl, 5.4, 'sly');
      say(tl, 5.4, 8.7, 'Только API нет — любуемся, как картиной в музее: руками не трогать!', B);
      Crab.emote(tl, 6.8, 'happy');
      return tl;
    },

    // =========================================================================
    // СЦЕНА 5 (34–43 с): 2 место
    // =========================================================================
    scene5(absStart) {
      const tl = gsap.timeline();
      const B = { x: 1490, y: 800, w: 410, tail: 'b', tx: 55 };
      const bar3 = Chart.bars[2], bar2 = Chart.bars[1];

      // ПЕРЕХОД «смахивание»: клешня сметает карточку №3
      Crab.emote(tl, 0, 'sly');
      Crab.arm(tl, 0, 'R', -75, 0.22, 'power3.in');
      Crab.arm(tl, 0.35, 'R', 0, 0.3, 'back.out(2)');
      tl.to('#card3', { x: -1500, rotation: -18, duration: 0.42, ease: 'power3.in' }, 0.05);
      speedlines(tl, 0.0, 16);
      tl.set('#card3', { autoAlpha: 0 }, 0.5);
      tl.to(bar3.bar, { boxShadow: '0 0 0 0px rgba(255,216,77,0), 0 0 0px 0px rgba(255,216,77,0)', duration: 0.3 }, 0.3);
      tl.to(bar3.col, { opacity: 0.45, duration: 0.3 }, 0.35);
      tl.to(bar2.col, { opacity: 1, duration: 0.3 }, 0.35);
      tl.to(bar2.bar, { boxShadow: '0 0 0 7px rgba(255,216,77,1), 0 0 60px 14px rgba(255,216,77,.9)', duration: 0.3 }, 0.45);
      tl.to(bar2.medal, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(3)' }, 0.5);
      Cues.cue(tl, 0.5, 'medal', { rank: 2 });

      // карточка падает сверху — с пылью
      tl.set('#card2', { autoAlpha: 1 }, 0.55);
      tl.to('#card2', { y: 0, rotation: -1.5, duration: 0.55, ease: 'power3.in' }, 0.55);
      Cues.cue(tl, 0.55, 'fall', { dur: 0.55 });
      dust(tl, 1.1, CARD.x + 60, 780, 8, 140, '#E9DCCB');
      dust(tl, 1.1, CARD.x + CARD.w - 60, 780, 8, 140, '#E9DCCB');
      shake(tl, 1.1, 14, 0.4);
      tl.to('#card2', { keyframes: { y: [0, -18, 0] }, duration: 0.3, ease: 'power1.out' }, 1.12);
      counters.push({ el: $('#card2 .c-num'), to: M[1].score, start: absStart + 1.2, dur: 0.8 });
      Cues.cue(tl, 1.2, 'count', { to: M[1].score, dur: 0.8 });

      // удивление → уважение
      Crab.emote(tl, 1.2, 'surprised');
      Crab.hop(tl, 1.2, 1720, 1050, 990, { dur: 0.35 });
      say(tl, 1.35, 3.7, 'Ого! Это же мой родственник!', B);
      Crab.emote(tl, 3.8, 'happy');
      Crab.look(tl, 3.8, -10, -2);
      say(tl, 3.8, 6.6, `В Terminal-Bench он обогнал даже старшего брата Opus: ${D.extras.terminalSonnet}% против ${D.extras.terminalOpus}%!`, B);
      Crab.snap(tl, 5.0, 'both', 2);
      Crab.emote(tl, 6.7, 'shy');
      say(tl, 6.7, 8.85, 'И вдвое дешевле. Семейные ужины теперь неловкие…', B);
      tl.to('#card2', { autoAlpha: 0, y: 60, duration: 0.3 }, 8.8);
      return tl;
    },

    // =========================================================================
    // СЦЕНА 6 (43–54 с): 1 место
    // =========================================================================
    scene6(absStart) {
      const tl = gsap.timeline();
      const B = { x: 1490, y: 800, w: 410, tail: 'b', tx: 55 };
      const bar1 = Chart.bars[0], bar2 = Chart.bars[1];
      const sp = this.spot;

      // затемнение
      tl.to(bar2.bar, { boxShadow: '0 0 0 0px rgba(255,216,77,0), 0 0 0px 0px rgba(255,216,77,0)', duration: 0.3 }, 0);
      tl.to(bar1.col, { opacity: 1, duration: 0.3 }, 0);
      tl.to('#dim', { autoAlpha: 1, duration: 0.7 }, 0);
      Cues.cue(tl, 0, 'dark', { dur: 2.35 });
      Cues.cue(tl, 0.4, 'spot', { dur: 0.5 });
      Cues.cue(tl, 0.9, 'spot', { dur: 0.4 });
      Cues.cue(tl, 1.3, 'spotlock');
      Crab.emote(tl, 0, 'surprised');
      Crab.look(tl, 0.3, -12, -6);

      // прожектор ищет победителя…
      // (центр «дырки» = центр слоя #dim, поэтому x/y считаются от его половинок 640×360)
      tl.to('#dim', { x: 1150 - 640, y: 500 - 360, duration: 0.5, ease: 'power1.inOut' }, 0.4);
      tl.to('#dim', { x: sp.x + 190 - 640, y: 420 - 360, duration: 0.4, ease: 'power1.inOut' }, 0.9);
      tl.to('#dim', { x: sp.x - 640, y: (sp.top + sp.base) / 2 - 360, duration: 0.45, ease: 'back.out(2)' }, 1.3);
      Object.assign($('#spotCone').style, { height: (sp.base + 10) + 'px' });
      tl.to('#spotCone', { autoAlpha: 1, scaleY: 1, duration: 0.4, ease: 'power2.out' }, 1.35);

      // корона падает на столбик
      tl.fromTo(Chart.crown, { autoAlpha: 1, y: -500, rotation: -20 }, { y: 0, rotation: 0, duration: 0.7, ease: 'bounce.out', immediateRender: false }, 1.6);
      Cues.cue(tl, 1.6, 'crown', { dur: 0.7 });
      shake(tl, 1.95, 10, 0.3);

      // хлопушка с конфетти
      Crab.prop(tl, 1.9, 'popper');
      Crab.arm(tl, 1.9, 'R', -28, 0.3);
      const pop = Crab.toStage(Crab.PT.popper, { cx: 1720, feetY: 1050, scale: 0.8 });
      tl.to('#cr-popper', { scale: 1.25, duration: 0.1, yoyo: true, repeat: 1 }, 2.3);
      confettiBurst(tl, 2.35, pop.x - 40, pop.y - 40, 70);
      confettiRain(tl, 2.4, 60, 1.6);
      shake(tl, 2.35, 12, 0.4);
      Crab.emote(tl, 2.35, 'happy');
      Crab.prop(tl, 2.9, 'popper', false);
      Crab.arm(tl, 2.9, 'R', 0, 0.3);

      // карточка победителя
      tl.to('#card1', { autoAlpha: 1, scale: 1, rotation: 0, duration: 1.0, ease: 'elastic.out(1, 0.5)' }, 2.6);
      counters.push({ el: $('#card1 .c-num'), to: M[0].score, start: absStart + 2.8, dur: 1.0 });
      Cues.cue(tl, 2.35, 'fanfare');
      Cues.cue(tl, 2.6, 'reveal', { rank: 1 });
      Cues.cue(tl, 2.8, 'count', { to: M[0].score, dur: 1.0 });
      Cues.cue(tl, 3.4, 'shine');
      tl.to('#card1 .c-shine', { xPercent: 300, duration: 0.9, ease: 'power2.inOut' }, 3.4);

      // реакция по РЕАЛЬНЫМ данным: №1 — Claude
      const isClaude = M[0].name.startsWith('Claude');
      Crab.emote(tl, 2.9, isClaude ? 'shy' : 'happy');
      if (isClaude) {
        Crab.coverFace(tl, 2.95, true);   // прячет румянец за ручкой
        say(tl, 2.9, 5.2, 'Ой… это же я. Говорил же — будет неловко.', B);
        Crab.coverFace(tl, 5.25, false);
        Crab.emote(tl, 5.3, 'proud');
        tl.to(Crab.flip, { scaleY: 1.08, scaleX: 0.96, duration: 0.25, yoyo: true, repeat: 1 }, 5.3);
        say(tl, 5.3, 7.6, 'Ну что вы, не стоило… хотя нет, стоило!', B);
      } else {
        say(tl, 2.9, 5.2, `Поздравляю, ${M[0].lab}! Честная победа.`, B);
        say(tl, 5.3, 7.6, 'А я тут просто ведущий. Записываю, учусь!', B);
      }

      // табличка — и честный вывод
      Crab.emote(tl, 7.6, 'happy');
      Crab.walk(tl, 7.4, 1640, 1050, 0.35);
      Crab.prop(tl, 7.75, 'sign');
      const gap01 = M[0].score - M[1].score;
      say(tl, 7.75, 10.65, `Но отрыв — всего ${pts(gap01)}. Один релиз — и всё может поменяться.`,
        { x: 1490, y: 650, w: 410, tail: 'b', tx: 40 });
      Crab.prop(tl, 10.5, 'sign', false);

      // ПЕРЕХОД «пиксельное рассыпание»: закрываем экран плитками
      tl.to('.tile', { scale: 1.02, rotation: 0, duration: 0.25, ease: 'power2.out', stagger: { each: 0.0018, from: 'random' } }, 10.7);
      Cues.cue(tl, 10.7, 'pixels', { dur: 0.5, dir: 'in' });
      return tl;
    },

    // =========================================================================
    // СЦЕНА 7 (54–60 с): финал
    // =========================================================================
    scene7() {
      const tl = gsap.timeline();
      const st = { cx: 400, feetY: 1000, scale: 1.1 };

      // под плитками меняем декорации
      tl.set(['#s3', '#dim', '#spotCone', '#card1'], { autoAlpha: 0 }, 0);
      tl.set('#world', { x: 0, y: 0, scale: 1 }, 0);
      tl.set('#s7', { autoAlpha: 1 }, 0);
      Crab.place(tl, 0, st.cx, st.feetY, st.scale);
      Crab.emote(tl, 0, 'happy');
      Crab.look(tl, 0, 6, -2);
      tl.to('.tile', { scale: 0, rotation: -45, duration: 0.25, ease: 'power2.in', stagger: { each: 0.0018, from: 'random' } }, 0.05);
      Cues.cue(tl, 0.05, 'pixels', { dur: 0.5, dir: 'out' });

      tl.to('#s7 .sunburst', { rotation: 25, duration: 6, ease: 'none' }, 0);

      // мысль со смыслом
      tl.to('#s7L1', { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: 'back.out(2.5)' }, 0.45);
      Cues.cue(tl, 0.45, 'line', { i: 0 });
      Cues.cue(tl, 1.15, 'line', { i: 1 });
      tl.to('#s7L2', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'back.out(2)' }, 1.15);
      tl.to('#footer', { autoAlpha: 1, duration: 0.4 }, 0.6);

      Crab.wave(tl, 1.7, 4, 'R');
      say(tl, 1.9, 4.3, 'Удачи с задачами! Пока!', { x: 150, y: 680, w: 440, tail: 'b', tx: 60 });
      Crab.emote(tl, 3.6, 'proud');

      // щелчок — и экран схлопывается в точку
      Crab.arm(tl, 4.3, 'R', -10, 0.15);
      Crab.snap(tl, 4.4, 'R', 1);
      const tip = Crab.toStage(Crab.PT.tipR, st);
      sparks(tl, 4.45, tip.x, tip.y);
      tl.set('#stageInner', { clipPath: `circle(1500px at ${tip.x}px ${tip.y}px)` }, 4.45);
      tl.to('#stageInner', { clipPath: `circle(0px at ${tip.x}px ${tip.y}px)`, duration: 0.8, ease: 'power3.in' }, 4.5);
      Cues.cue(tl, 4.5, 'collapse', { dur: 0.8 });
      Cues.cue(tl, 5.25, 'ding');
      tl.to('#footer', { color: '#F4E9DC', duration: 0.3 }, 4.8);
      const dot = fxEl('final-dot');
      $('#stage').appendChild(dot);
      tl.fromTo(dot, { x: tip.x - 14, y: tip.y - 14, scale: 0, autoAlpha: 1 }, { scale: 1.4, duration: 0.2, ease: 'back.out(4)', immediateRender: false }, 5.25);
      tl.to(dot, { scale: 0, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, 5.55);
      return tl;
    }
  };

  window.Scenes = Scenes;
})();
