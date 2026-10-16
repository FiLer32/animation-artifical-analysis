/* ==========================================================================
   chart.js — НАСТОЯЩИЙ график Intelligence Index: скриншот с
   artificialanalysis.ai (снимок от 16.10.2026, «27 of 704 models»).

   Картинка показывается как есть; анимации живут в слоях поверх неё,
   строго по координатам столбиков, снятым со скриншота
   (assets/make_chart_assets.py):
     • шторка роста — кусок «пустого» кадра без столбика уезжает вверх
       и открывает настоящий столбик;
     • затемнение — полупрозрачная белая вуаль над колонкой;
     • подсветка, медали, корона — рамки и значки над столбиками.
   ========================================================================== */

(function () {
  'use strict';

  const D = window.AA_DATA;

  // --- Скриншот и координаты его столбиков (в пикселях скриншота) ----------
  const SHOT = {
    src: 'assets/aa-intelligence-index.png',
    empty: 'assets/aa-intelligence-index-empty.png',
    w: 2324, h: 1182,
    baseY: 792,          // нижний край столбиков
    labelStart: 836,     // под логотипами начинаются наклонные подписи
    labelsBottom: 1000,  // нижний край наклонных подписей
    // [левый x, правый x, верх y] — 27 столбиков слева направо
    bars: [[116, 173, 425], [195, 253, 435], [275, 333, 436], [355, 412, 452], [434, 492, 456],
      [514, 572, 457], [594, 652, 458], [673, 731, 462], [753, 811, 496], [833, 891, 497],
      [913, 970, 502], [992, 1050, 504], [1072, 1130, 513], [1152, 1210, 514], [1231, 1289, 515],
      [1311, 1369, 525], [1391, 1449, 531], [1471, 1528, 540], [1550, 1608, 544], [1630, 1688, 547],
      [1710, 1767, 549], [1789, 1847, 577], [1869, 1927, 597], [1949, 2007, 598], [2028, 2086, 606],
      [2108, 2166, 623], [2188, 2246, 633]]
  };

  // --- Где карточка со скриншотом стоит в «мире» -----------------------------
  const G = { cardX: 30, cardY: 130, cardW: 1440 };
  G.s = G.cardW / SHOT.w;                       // масштаб скриншот → мир
  G.cardH = Math.round(SHOT.h * G.s);

  const Chart = {
    G, SHOT,
    bars: [],

    // --- геометрия в координатах карточки (px) --------------------------------
    local(i) {
      const [a, b, top] = SHOT.bars[i], s = G.s;
      return { x0: a * s, x1: (b + 1) * s, cx: (a + b + 1) / 2 * s, top: top * s, base: (SHOT.baseY + 1) * s };
    },
    // --- и в координатах мира --------------------------------------------------
    barCX(i) { return G.cardX + this.local(i).cx; },
    barTopY(i) { return G.cardY + this.local(i).top; },
    baseWorldY() { return G.cardY + (SHOT.baseY + 1) * G.s; },
    labelsBottomY() { return G.cardY + SHOT.labelsBottom * G.s; },

    build() {
      const root = document.getElementById('chart');
      const card = document.createElement('div');
      card.className = 'chart-card shot';
      Object.assign(card.style, {
        left: G.cardX + 'px', top: G.cardY + 'px',
        width: G.cardW + 'px', height: G.cardH + 'px'
      });
      card.innerHTML = `<img class="shot-img" src="${SHOT.src}" alt="${D.indexName} — скриншот artificialanalysis.ai, ${D.date}">
        <div class="ch-over"></div>`;
      root.appendChild(card);
      this.card = card;
      const over = card.querySelector('.ch-over');
      this.over = over;

      SHOT.bars.forEach((_, i) => {
        const L = this.local(i);
        const w = L.x1 - L.x0;

        // шторка роста: кусок «пустого» кадра поверх столбика
        const cover = document.createElement('div');
        cover.className = 'bar-cover';
        const top = L.top - 4 * G.s;
        Object.assign(cover.style, {
          left: (L.x0 - 2 * G.s) + 'px', top: top + 'px',
          width: (w + 4 * G.s) + 'px', height: (L.base - top + G.s) + 'px',
          backgroundImage: `url(${SHOT.empty})`,
          backgroundSize: `${G.cardW}px ${G.cardH}px`,
          backgroundPosition: `${-(L.x0 - 2 * G.s)}px ${-top}px`
        });

        // вуаль затемнения: столбик + логотип под ним. Наклонные подписи
        // не трогаем — они заходят на соседние колонки, и вуаль резала бы их пополам
        const shade = document.createElement('div');
        shade.className = 'bar-shade';
        const w0 = 80 * G.s, yT = L.top - 30 * G.s;
        Object.assign(shade.style, {
          left: (L.cx - w0 / 2) + 'px', top: yT + 'px',
          width: w0 + 'px', height: (SHOT.labelStart * G.s - yT) + 'px'
        });

        // рамка подсветки ровно по столбику
        const hl = document.createElement('div');
        hl.className = 'bar-hl';
        Object.assign(hl.style, {
          left: L.x0 + 'px', top: L.top + 'px', width: w + 'px', height: (L.base - L.top) + 'px'
        });

        // медаль над столбиком
        const medal = document.createElement('div');
        medal.className = 'bar-medal';
        Object.assign(medal.style, { left: L.cx + 'px', top: (L.top - 44) + 'px' });

        over.append(shade, cover, hl, medal);
        this.bars.push({ cover, shade, bar: hl, medal, model: D.models[i] || null });
      });

      // корона над лидером (свой SVG)
      const crown = document.createElement('div');
      crown.className = 'crown';
      crown.innerHTML = `<svg viewBox="0 0 120 90" width="56" height="42">
          <path d="M 10 80 L 4 22 L 34 46 L 60 6 L 86 46 L 116 22 L 110 80 Z"
                fill="#FFC928" stroke="#3B1E14" stroke-width="6" stroke-linejoin="round"/>
          <rect x="10" y="68" width="100" height="14" rx="4" fill="#F5A300" stroke="#3B1E14" stroke-width="5"/>
          <circle cx="60" cy="48" r="9" fill="#E8463A" stroke="#3B1E14" stroke-width="4"/>
          <circle cx="32" cy="58" r="6" fill="#5CB8FF" stroke="#3B1E14" stroke-width="3"/>
          <circle cx="88" cy="58" r="6" fill="#5CB8FF" stroke="#3B1E14" stroke-width="3"/>
        </svg>`;
      const L0 = this.local(0);
      Object.assign(crown.style, { left: (L0.cx - 28) + 'px', top: (L0.top - 50) + 'px' });
      over.appendChild(crown);
      this.crown = crown;

      // начальное состояние: столбики «спрятаны» под шторками
      gsap.set(this.bars.map(b => b.cover), { scaleY: 1, transformOrigin: '50% 0%' });
      gsap.set(this.bars.map(b => b.shade), { opacity: 0 });
      gsap.set(this.bars.map(b => b.medal), { autoAlpha: 0, scale: 0, xPercent: -50 });
      gsap.set(crown, { autoAlpha: 0 });
    },

    /** Рост столбиков слева направо: шторки уезжают вверх. */
    grow(tl, at, stagger) {
      this.bars.forEach((b, i) => {
        const t = at + i * stagger;
        tl.to(b.cover, { scaleY: 0, duration: 0.6, ease: 'power2.out' }, t);
        Cues.cue(tl, t, 'bar', { i });
      });
    },

    /** Яркость колонок: 1 — как на скриншоте, меньше — тусклее. */
    fade(tl, at, idx, brightness, dur = 0.3) {
      tl.to(idx.map(i => this.bars[i].shade), { opacity: (1 - brightness) * 0.95, duration: dur }, at);
    }
  };

  window.Chart = Chart;
})();
