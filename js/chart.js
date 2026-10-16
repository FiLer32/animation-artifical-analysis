/* ==========================================================================
   chart.js — диаграмма Intelligence Index в подаче artificialanalysis.ai:
   белая карточка, serif-заголовок, пунктирная сетка, столбцы, отсортированные
   по убыванию, цвет = лаборатория, значение внутри столбца, под столбцом —
   значок лаборатории и наклонная подпись модели, «клеточка» для моделей
   без публичного API. Логотипы НЕ копируются: вместо них — свои монограммы.

   Геометрия задаётся в координатах «мира» (#world, 1920×1080 при зуме 1).
   ========================================================================== */

(function () {
  'use strict';

  const D = window.AA_DATA;

  // --- Геометрия (мировые координаты) ----------------------------------------
  const G = {
    cardX: 40, cardY: 90, cardW: 1420, cardH: 820,
    plotX: 190,          // от левого края карточки до первого слота
    baseY: 600,          // базовая линия внутри карточки
    slot: 120,           // ширина слота
    barW: 88,            // ширина столбца
    pxPerPoint: 7        // пикселей на 1 балл
  };

  const Chart = {
    G,
    bars: [],

    /** Центр столбца i (0..9) по x в мировых координатах. */
    barCX(i) { return G.cardX + G.plotX + G.slot * i + G.slot / 2; },
    /** Верх столбца i по y в мировых координатах. */
    barTopY(i) { return G.cardY + G.baseY - D.models[i].score * G.pxPerPoint; },
    baseWorldY() { return G.cardY + G.baseY; },

    build() {
      const root = document.getElementById('chart');
      const card = document.createElement('div');
      card.className = 'chart-card';
      Object.assign(card.style, {
        left: G.cardX + 'px', top: G.cardY + 'px',
        width: G.cardW + 'px', height: G.cardH + 'px'
      });

      // Заголовок и подзаголовок — как на сайте
      card.innerHTML = `
        <div class="ch-title">${D.indexName}</div>
        <div class="ch-sub">${D.indexVersion} · сводный балл из ${D.benchmarks.length} тестов · выше — лучше ·
          топ-${D.models.length} из ${D.modelsOnChart} моделей на графике сайта</div>
        <div class="ch-legend">
          <span class="lg-item"><i class="lg-sw lg-check"></i>Нет публичного API</span>
          ${Object.keys(D.labs).map(l =>
            `<span class="lg-item"><i class="lg-sw" style="background:${D.labs[l].color}"></i>${l}</span>`
          ).join('')}
        </div>
        <div class="ch-plot"></div>
        <div class="ch-src">по данным ${D.sourceUrl} · ${D.date}</div>`;
      root.appendChild(card);
      this.card = card;

      const plot = card.querySelector('.ch-plot');

      // Пунктирная сетка (без подписей — как на сайте)
      for (let v = 15; v <= D.axisMax; v += 15) {
        const g = document.createElement('div');
        g.className = 'ch-grid';
        g.style.top = (G.baseY - v * G.pxPerPoint) + 'px';
        plot.appendChild(g);
      }
      const base = document.createElement('div');
      base.className = 'ch-grid ch-base';
      base.style.top = G.baseY + 'px';
      plot.appendChild(base);

      // Столбцы
      D.models.forEach((m, i) => {
        const lab = D.labs[m.lab];
        const col = document.createElement('div');
        col.className = 'bar-col';
        col.style.left = (G.plotX + G.slot * i) + 'px';
        col.style.width = G.slot + 'px';

        const h = m.score * G.pxPerPoint;
        const bg = m.noApi
          ? `repeating-conic-gradient(${lab.color} 0 25%, #5CB8FF 0 50%) 0 0 / 22px 22px`
          : lab.color;

        col.innerHTML = `
          <div class="bar-medal"></div>
          <div class="bar" style="height:${h}px; top:${G.baseY - h}px; left:${(G.slot - G.barW) / 2}px; width:${G.barW}px; background:${bg}">
            <span class="bar-val" style="color:${lab.text}">0</span>
          </div>
          <div class="bar-lab" style="top:${G.baseY + 12}px; background:${lab.color}">${m.lab[0]}</div>
          <div class="bar-name" style="top:${G.baseY + 58}px">
            <span>${m.name}</span>${m.variant ? `<span class="bn-var">${m.variant}</span>` : ''}
          </div>`;
        plot.appendChild(col);

        const medal = col.querySelector('.bar-medal');
        medal.style.top = (G.baseY - h - 70) + 'px';

        this.bars.push({
          col,
          bar: col.querySelector('.bar'),
          val: col.querySelector('.bar-val'),
          lab: col.querySelector('.bar-lab'),
          name: col.querySelector('.bar-name'),
          medal,
          model: m
        });
      });

      // Корона над лидером (свой SVG)
      const crown = document.createElement('div');
      crown.className = 'crown';
      crown.innerHTML = `<svg viewBox="0 0 120 90" width="120" height="90">
          <path d="M 10 80 L 4 22 L 34 46 L 60 6 L 86 46 L 116 22 L 110 80 Z"
                fill="#FFC928" stroke="#3B1E14" stroke-width="6" stroke-linejoin="round"/>
          <rect x="10" y="68" width="100" height="14" rx="4" fill="#F5A300" stroke="#3B1E14" stroke-width="5"/>
          <circle cx="60" cy="48" r="9" fill="#E8463A" stroke="#3B1E14" stroke-width="4"/>
          <circle cx="32" cy="58" r="6" fill="#5CB8FF" stroke="#3B1E14" stroke-width="3"/>
          <circle cx="88" cy="58" r="6" fill="#5CB8FF" stroke="#3B1E14" stroke-width="3"/>
        </svg>`;
      const b0 = this.bars[0];
      crown.style.left = (G.plotX + (G.slot - 120) / 2) + 'px';
      crown.style.top = (G.baseY - b0.model.score * G.pxPerPoint - 104) + 'px';
      plot.appendChild(crown);
      this.crown = crown;

      // Начальное состояние: столбцы «сложены»
      this.bars.forEach(b => {
        gsap.set(b.bar, { scaleY: 0, transformOrigin: '50% 100%' });
        gsap.set([b.lab, b.name], { autoAlpha: 0 });
        gsap.set(b.medal, { autoAlpha: 0, scale: 0 });
      });
      gsap.set(crown, { autoAlpha: 0 });
    },

    /**
     * Анимация роста столбцов по очереди. counters — массив, куда
     * складываются счётчики (их значения считает main.js от времени мастера).
     */
    grow(tl, at, stagger, absStart, counters) {
      this.bars.forEach((b, i) => {
        const t = at + i * stagger;
        tl.to(b.bar, { scaleY: 1, duration: 0.7, ease: 'back.out(1.6)' }, t);
        tl.fromTo(b.lab, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, t + 0.15);
        // подпись повёрнута через CSS, поэтому анимируем только прозрачность
        tl.to(b.name, { autoAlpha: 1, duration: 0.3, ease: 'power2.out' }, t + 0.2);
        counters.push({ el: b.val, to: b.model.score, start: absStart + t, dur: 0.7 });
      });
    }
  };

  window.Chart = Chart;
})();
