/* ==========================================================================
   crab.js — крабик Claude в пиксельном стиле: плоское оранжевое тело-блок,
   прямоугольные ручки по бокам, глаза-прямоугольники и четыре ножки.

   Все анимации добавляются в переданный gsap.timeline() на заданное время,
   поэтому мастер-таймлайн можно перематывать в любую сторону (никаких
   setTimeout и «живых» случайностей во время проигрывания).

   Пропорции сняты с эскиза 344×215 px («единицы эскиза») и переводятся
   в координаты SVG (viewBox 0 0 400 340) функциями X()/Y()/S().
   Обёртка #crab позиционируется так, что (x, y) в API — это ЦЕНТР краба
   и точка, где стоят его НОЖКИ.
   ========================================================================== */

(function () {
  'use strict';

  // --- Палитра персонажа ----------------------------------------------------
  const C = {
    body:  '#D98964',   // цвет с эскиза
    dark:  '#B9694A',   // тени реквизита
    eye:   '#141414',
    blush: '#F2A0A8',
    white: '#FFFFFF'
  };

  const W = 400, H = 340;          // размер SVG
  const FEET = 336;                // y нижнего края ножек в SVG

  // Эскиз → SVG: масштаб k и смещение (крабик по центру, ножки на FEET)
  const k = 1.15, OX = 200 - 171.5 * k, OY = FEET - 213 * k;
  const X = x => +(OX + x * k).toFixed(2);
  const Y = y => +(OY + y * k).toFixed(2);
  const S = v => +(v * k).toFixed(2);

  /** Прямоугольник в единицах эскиза. */
  function rect(x, y, w, h, fill, extra = '') {
    return `<rect x="${X(x)}" y="${Y(y)}" width="${S(w)}" height="${S(h)}" fill="${fill}" ${extra}/>`;
  }
  /** Прямоугольник относительно центра (cx, cy) — для глаз и рта. */
  function rc(cx, cy, dx, dy, w, h, fill) {
    return rect(cx + dx - w / 2, cy + dy - h / 2, w, h, fill);
  }

  // Ключевые точки эскиза
  const BODY = { x: 44, y: 1, w: 256, h: 170 };
  const EYE_L = { x: 94.5, y: 64 }, EYE_R = { x: 249.5, y: 64 };
  const MOUTH = { x: 172, y: 118 };
  const SHOULDER_L = { x: 44, y: 107 }, SHOULDER_R = { x: 300, y: 107 };
  const TIP_L = { x: 1, y: 107 }, TIP_R = { x: 342, y: 107 };

  // ---------------------------------------------------------------------------
  // Части SVG
  // ---------------------------------------------------------------------------

  function legs() {
    // четыре ножки; a/b — пары, которые шагают поочерёдно
    const L = [[61, 'a'], [103, 'b'], [215, 'a'], [258, 'b']];
    return L.map(([x, p]) => `<g class="leg leg-${p}">${rect(x, 168, 26, 45, C.body)}</g>`).join('');
  }

  /** Один глаз со всеми вариантами эмоций (видимость переключается opacity). */
  function eye(side) {
    const c = side === 'L' ? EYE_L : EYE_R;
    const inner = side === 'L' ? 1 : -1;   // в сторону центра лица
    const poly = pts => pts.map(([dx, dy]) => `${X(c.x + dx)},${Y(c.y + dy)}`).join(' ');
    return `<g class="eyeball" id="cr-eye${side}">
      <!-- обычные: вертикальные прямоугольники, как на эскизе -->
      <g class="ev ev-normal">${rc(c.x, c.y, 0, 0, 15, 38, C.eye)}</g>
      <!-- удивление: большие «блюдца» с бликом -->
      <g class="ev ev-wide">${rc(c.x, c.y, 0, 0, 26, 50, C.eye)}${rc(c.x, c.y, -5, -13, 8, 8, C.white)}</g>
      <!-- радость: пиксельные ^ ^ -->
      <g class="ev ev-happy"><polyline points="${poly([[-14, 9], [0, -7], [14, 9]])}" fill="none" stroke="${C.eye}" stroke-width="${S(9)}" stroke-linecap="square"/></g>
      <!-- хитрость: прищур + «бровь» -->
      <g class="ev ev-sly">${rc(c.x, c.y, 2 * inner, 6, 22, 10, C.eye)}${rc(c.x, c.y, -2 * inner, -12, 22, 6, C.eye)}</g>
      <!-- гордость / довольство: закрытые глаза-черточки -->
      <g class="ev ev-closed">${rc(c.x, c.y, 0, 4, 26, 8, C.eye)}</g>
      <!-- невидимая рамка, чтобы центр моргания совпадал с центром глаза -->
      ${rc(c.x, c.y, 0, 0, 30, 54, 'none')}
    </g>`;
  }

  function mouths() {
    const m = MOUTH;
    return `<g id="cr-mouth">
      <g class="mo mo-none"></g>
      <g class="mo mo-smile">${rc(m.x, m.y, -15, -4, 8, 8, C.eye)}${rc(m.x, m.y, 0, 3, 22, 8, C.eye)}${rc(m.x, m.y, 15, -4, 8, 8, C.eye)}</g>
      <g class="mo mo-grin">${rc(m.x, m.y, -17, -6, 8, 8, C.eye)}${rc(m.x, m.y, 0, 3, 30, 12, C.eye)}${rc(m.x, m.y, 17, -6, 8, 8, C.eye)}${rc(m.x, m.y, 0, 5, 12, 5, '#E8707A')}</g>
      <g class="mo mo-open">${rc(m.x, m.y, 0, 0, 16, 20, C.eye)}</g>
      <g class="mo mo-smirk">${rc(m.x, m.y, -4, 4, 20, 7, C.eye)}${rc(m.x, m.y, 10, -2, 8, 7, C.eye)}</g>
      <g class="mo mo-wavy">${rc(m.x, m.y, -12, 3, 8, 6, C.eye)}${rc(m.x, m.y, -4, -2, 8, 6, C.eye)}${rc(m.x, m.y, 4, 3, 8, 6, C.eye)}${rc(m.x, m.y, 12, -2, 8, 6, C.eye)}</g>
    </g>`;
  }

  /** Ручка-блок: верхняя половинка «щёлкает» как клешня. */
  function arm(side) {
    const x = side === 'L' ? 1 : 300, w = side === 'L' ? 43 : 42;
    return `<g class="arm" id="cr-arm${side}">
      ${props(side, 'back')}
      ${rect(x, 107, w, 21, C.body, 'class="limb"')}
      <g class="pincer" id="cr-pin${side}">${rect(x, 86, w, 22, C.body, 'class="limb"')}</g>
      ${props(side, 'front')}
    </g>`;
  }

  /** Реквизит, который крабик «достаёт из ниоткуда» (тоже в пиксельном духе). */
  function props(side, layer) {
    const tx = X(side === 'L' ? TIP_L.x : TIP_R.x), ty = Y(TIP_R.y);
    const line = (x1, y1, x2, y2, col, w) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="square"/>`;
    if (layer !== 'back') return '';

    if (side === 'R') {
      return `
      <!-- указка -->
      <g class="prop" id="cr-pointer">
        ${line(tx - 12, ty, tx + 70, ty - 200, '#5A3A22', 13)}
        ${line(tx - 12, ty, tx + 70, ty - 200, '#C48A4E', 6)}
        <rect x="${tx + 58}" y="${ty - 214}" width="24" height="24" fill="#E8463A"/>
      </g>
      <!-- табличка -->
      <g class="prop" id="cr-sign">
        <rect x="${tx - 22}" y="${ty - 170}" width="14" height="170" fill="#8A5A32"/>
        <rect x="${tx - 240}" y="${ty - 300}" width="360" height="140" fill="#3B1E14"/>
        <rect x="${tx - 232}" y="${ty - 292}" width="344" height="124" fill="#FFFDF7"/>
        <text x="${tx - 60}" y="${ty - 242}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="32" fill="#3B1E14">ЧЕСТНО,</text>
        <text x="${tx - 60}" y="${ty - 196}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="30" fill="#C2410C">НЕ ПОДКРУЧИВАЛ!</text>
      </g>
      <!-- хлопушка -->
      <g class="prop" id="cr-popper">
        <polygon points="${tx - 10},${ty - 6} ${tx + 6},${ty - 6} ${tx + 34},${ty - 130} ${tx - 50},${ty - 130}" fill="#7C5CFF"/>
        <rect x="${tx - 34}" y="${ty - 96}" width="54" height="12" fill="#FFD84D"/>
        <rect x="${tx - 44}" y="${ty - 140}" width="76" height="14" fill="#FFD84D"/>
      </g>
      ${stick('R', tx, ty, line)}`;
    }
    return `
      <!-- микрофон -->
      <g class="prop" id="cr-mic">
        <rect x="${tx + 2}" y="${ty - 110}" width="18" height="104" fill="#2E2E3A"/>
        <rect x="${tx - 14}" y="${ty - 158}" width="50" height="52" fill="#A9B4C2"/>
        <rect x="${tx - 14}" y="${ty - 142}" width="50" height="6" fill="#6B7686"/>
        <rect x="${tx - 14}" y="${ty - 126}" width="50" height="6" fill="#6B7686"/>
      </g>
      ${stick('L', tx, ty, line)}`;
  }

  /** Барабанная палочка: из кончика ручки вниз-внутрь. */
  function stick(side, tx, ty, line) {
    const dir = side === 'L' ? 1 : -1;
    return `<g class="prop cr-stick" id="cr-stick${side}">
      ${line(tx, ty, tx + dir * 110, ty + 120, '#5A3A22', 13)}
      ${line(tx, ty, tx + dir * 110, ty + 120, '#E9C38B', 6)}
      <rect x="${tx + dir * 110 - 12}" y="${ty + 108}" width="24" height="24" fill="#E9C38B"/>
    </g>`;
  }

  function svg() {
    const glasses = c => `<rect x="${X(c.x - 21)}" y="${Y(c.y - 30)}" width="${S(42)}" height="${S(60)}"
          fill="rgba(190,225,255,.3)" stroke="#141414" stroke-width="${S(8)}"/>`;
    return `<svg class="crab-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" overflow="visible" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
      <!-- мягкая тень -->
      <ellipse id="cr-shadow" cx="200" cy="${FEET + 2}" rx="160" ry="12" fill="rgba(59,30,20,.16)" shape-rendering="auto"/>
      <g id="cr-legs">${legs()}</g>
      <!-- тело-блок -->
      <g id="cr-body">
        ${rect(BODY.x, BODY.y, BODY.w, BODY.h, C.body)}
        <!-- лицо: «поп» при смене эмоции двигает всю группу, взгляд — её части -->
        <g id="cr-face">
        <g id="cr-blush">
          ${rc(EYE_L.x, EYE_L.y, -2, 38, 30, 10, C.blush)}
          ${rc(EYE_R.x, EYE_R.y, 2, 38, 30, 10, C.blush)}
        </g>
        <g id="cr-eyes">
          ${eye('L')}
          ${eye('R')}
          <!-- очки -->
          <g class="prop" id="cr-glasses">
            ${glasses(EYE_L)}${glasses(EYE_R)}
            ${rect(EYE_L.x + 21, EYE_L.y - 16, EYE_R.x - EYE_L.x - 42, 7, '#141414')}
            ${rect(EYE_L.x - 12, EYE_L.y - 22, 8, 8, '#FFFFFF')}${rect(EYE_R.x - 12, EYE_R.y - 22, 8, 8, '#FFFFFF')}
          </g>
        </g>
        ${mouths()}
        </g>
      </g>
      <!-- ручки поверх тела: так ручкой можно прикрыть лицо -->
      ${arm('L')}
      ${arm('R')}
    </svg>`;
  }

  // ---------------------------------------------------------------------------
  // API
  // ---------------------------------------------------------------------------
  const Crab = {
    el: null,
    W, H, FEET,

    /** Полезные точки в координатах SVG (для искр, конфетти, масок). */
    PT: {
      tipR:   { x: X(TIP_R.x), y: Y(TIP_R.y) },
      tipL:   { x: X(TIP_L.x), y: Y(TIP_L.y) },
      eyeR:   { x: X(EYE_R.x), y: Y(EYE_R.y) },
      popper: { x: X(TIP_R.x) - 8, y: Y(TIP_R.y) - 140 },
      top:    { x: 200, y: Y(BODY.y) }
    },

    /** Вставить SVG и выставить начальное состояние. */
    build() {
      this.el = document.getElementById('crab');
      this.flip = document.getElementById('crabFlip');
      this.bob = document.getElementById('crabBob');
      this.bob.innerHTML = svg();
      const q = s => this.el.querySelectorAll(s);
      this.$ = q;

      gsap.set(this.el, { x: 960 - 200, y: 1400, scale: 1, transformOrigin: '50% 100%' });
      gsap.set([this.bob, this.flip], { transformOrigin: '50% 100%' });
      gsap.set(q('.prop'), { autoAlpha: 0, scale: 0.2, transformOrigin: '50% 100%' });
      gsap.set('#cr-blush', { autoAlpha: 0 });
      gsap.set(q('.eyeball'), { transformOrigin: '50% 50%' });
      // руки вращаются вокруг «плеча» — точки, где ручка входит в тело
      gsap.set('#cr-armR', { svgOrigin: `${X(SHOULDER_R.x)} ${Y(SHOULDER_R.y)}` });
      gsap.set('#cr-armL', { svgOrigin: `${X(SHOULDER_L.x)} ${Y(SHOULDER_L.y)}` });
      this._applyEmotion('normal');
    },

    /** Координаты обёртки для «центр краба = cx, ножки на feetY». */
    pos(cx, feetY, scale) {
      const v = { x: cx - W / 2, y: feetY - H };
      if (scale != null) v.scale = scale;
      return v;
    },

    /** Точка SVG {x, y} → координаты сцены при положении {cx, feetY, scale}. */
    toStage(p, st) {
      const s = st.scale == null ? 1 : st.scale;
      return { x: st.cx + (p.x - W / 2) * s, y: st.feetY - (H - p.y) * s };
    },

    /** Мгновенно поставить краба. */
    place(tl, at, cx, feetY, scale) {
      tl.set(this.el, this.pos(cx, feetY, scale), at);
    },

    /** Ходьба боком: перемещение + перебор ножек + покачивание корпуса. */
    walk(tl, at, cx, feetY, dur, opts = {}) {
      const step = 0.09;
      const n = Math.max(1, Math.round(dur / (step * 2)));
      tl.to(this.el, Object.assign(this.pos(cx, feetY, opts.scale), {
        duration: dur, ease: opts.ease || 'power1.inOut'
      }), at);
      tl.to(this.$('.leg-a'), { y: -14, duration: step, yoyo: true, repeat: n * 2 - 1, ease: 'steps(2)' }, at);
      tl.to(this.$('.leg-b'), { y: -14, duration: step, yoyo: true, repeat: n * 2 - 1, ease: 'steps(2)' }, at + step);
      tl.to(this.flip, { y: -8, duration: step, yoyo: true, repeat: n * 2 - 1, ease: 'sine.inOut' }, at);
    },

    /** Прыжок по дуге с приземлением (squash & stretch).
        peakFeetY — где окажутся ножки в верхней точке прыжка. */
    hop(tl, at, cx, feetY, peakFeetY, opts = {}) {
      const dur = opts.dur || 0.6;
      const target = this.pos(cx, feetY, opts.scale);
      tl.to(this.flip, { scaleY: 0.8, scaleX: 1.15, duration: 0.1, ease: 'power2.out' }, at);
      tl.to(this.el, { x: target.x, duration: dur, ease: 'none' }, at + 0.1);
      if (opts.scale != null) tl.to(this.el, { scale: opts.scale, duration: dur, ease: 'power1.inOut' }, at + 0.1);
      tl.to(this.el, { y: peakFeetY - H, duration: dur / 2, ease: 'power2.out' }, at + 0.1);
      tl.to(this.el, { y: target.y, duration: dur / 2, ease: 'power2.in' }, at + 0.1 + dur / 2);
      tl.to(this.flip, { scaleY: 1.12, scaleX: 0.92, duration: 0.15, ease: 'power1.out' }, at + 0.1);
      tl.to(this.flip, { scaleY: 1, scaleX: 1, duration: 0.2 }, at + 0.25);
      this.land(tl, at + 0.1 + dur);
    },

    /** Приземление: сплющивание и отскок. */
    land(tl, at) {
      tl.to(this.flip, { scaleY: 0.78, scaleX: 1.2, duration: 0.08, ease: 'power2.out' }, at);
      tl.to(this.flip, { scaleY: 1, scaleX: 1, duration: 0.5, ease: 'elastic.out(1.1, 0.35)' }, at + 0.08);
    },

    /** Эмоции: normal, happy, surprised, sly, shy, proud, shyproud. */
    EMO: {
      normal:    { eye: 'normal', mouth: 'none',  blush: 0 },
      happy:     { eye: 'happy',  mouth: 'grin',  blush: 0 },
      surprised: { eye: 'wide',   mouth: 'open',  blush: 0 },
      sly:       { eye: 'sly',    mouth: 'smirk', blush: 0 },
      shy:       { eye: 'happy',  mouth: 'wavy',  blush: 1 },
      proud:     { eye: 'closed', mouth: 'grin',  blush: 0 },
      shyproud:  { eye: 'closed', mouth: 'smile', blush: 1 }
    },

    _applyEmotion(name) {
      const e = this.EMO[name];
      gsap.set(this.$('.ev'), { opacity: 0 });
      gsap.set(this.$('.ev-' + e.eye), { opacity: 1 });
      gsap.set(this.$('.mo'), { opacity: 0 });
      gsap.set(this.$('.mo-' + e.mouth), { opacity: 1 });
      gsap.set('#cr-blush', { autoAlpha: e.blush });
      this._emo = name;
    },

    /**
     * Смена эмоции. Сами эмоции НЕ кладутся в таймлайн через set() — при
     * перемотке назад цепочки set() по общим элементам откатываются ненадёжно.
     * Вместо этого запоминаем расписание, а main.js на каждом кадре вызывает
     * Crab.sync(t) и выставляет эмоцию, действующую в момент t.
     */
    _emos: [],
    emote(tl, at, name) {
      this._emos.push({ tl, at, name });
      // маленький «поп» лица при смене эмоции (явные значения — безопасно для перемотки)
      tl.fromTo('#cr-face', { y: 0 }, {
        y: -6, duration: 0.08, yoyo: true, repeat: 1, immediateRender: false
      }, at);
    },

    /** Перевести расписание эмоций в абсолютное время мастер-таймлайна. */
    resolve(master) {
      this._sched = this._emos
        .map((e, i) => ({ t: (e.tl === master ? 0 : e.tl.startTime()) + e.at, name: e.name, i }))
        .sort((a, b) => a.t - b.t || a.i - b.i);
    },

    /** Выставить эмоцию, действующую в момент t (вызывается на каждом кадре). */
    sync(t) {
      let name = 'normal';
      for (const e of this._sched) { if (e.t <= t + 1e-6) name = e.name; else break; }
      if (name !== this._emo) this._applyEmotion(name);
    },

    /** Куда «смотрит» крабик: глаза и рот чуть сдвигаются (в пиксельном лице нет зрачков). */
    look(tl, at, dx, dy, dur = 0.2) {
      tl.to(this.$('.eyeball, #cr-mouth, #cr-blush'), { x: dx * 0.8, y: dy * 0.6, duration: dur, ease: 'steps(3)' }, at);
    },

    blink(tl, at) {
      tl.to(this.$('.eyeball'), { scaleY: 0.12, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.in' }, at);
    },

    /** Моргание раз в 2–4 с на отрезке [from, to] — с детерминированным «случаем». */
    blinkSchedule(tl, from, to, rnd) {
      let t = from + 1.2;
      while (t < to - 0.3) {
        this.blink(tl, t);
        t += 2 + rnd() * 2;
      }
    },

    /** Idle-дыхание: squash & stretch на всём ролике. */
    idle(tl, from, to) {
      const d = 0.55;
      const n = Math.floor((to - from) / d) - 1;
      tl.to(this.bob, {
        scaleY: 0.965, scaleX: 1.03, duration: d, ease: 'sine.inOut',
        yoyo: true, repeat: n % 2 ? n : n - 1
      }, from);
    },

    /** Щелчок «клешнёй»: верхняя половинка ручки открывается и захлопывается. */
    snap(tl, at, side = 'both', times = 1) {
      const t = side === 'both' ? this.$('.pincer') : this.$('#cr-pin' + side);
      for (let i = 0; i < times; i++) {
        tl.to(t, { y: -14, duration: 0.06, yoyo: true, repeat: 1, ease: 'power2.in' }, at + i * 0.18);
      }
    },

    /** Поворот руки вокруг плеча. Отрицательный угол = поднять руку (для обеих сторон). */
    arm(tl, at, side, rot, dur = 0.3, ease = 'back.out(2)') {
      const sides = side === 'both' ? ['L', 'R'] : [side];
      sides.forEach(s => tl.to('#cr-arm' + s, { rotation: s === 'L' ? -rot : rot, duration: dur, ease }, at));
    },

    /** Вежливые аплодисменты: ручки вверх и «хлоп-хлоп». */
    clap(tl, at, count = 4) {
      this.arm(tl, at, 'both', -55, 0.18, 'power2.out');
      for (let i = 0; i < count; i++) {
        const t = at + 0.2 + i * 0.26;
        tl.to('#cr-armR', { rotation: -75, duration: 0.09, yoyo: true, repeat: 1, ease: 'power2.in' }, t);
        tl.to('#cr-armL', { rotation: 75, duration: 0.09, yoyo: true, repeat: 1, ease: 'power2.in' }, t);
        tl.to(this.$('.pincer'), { y: -10, duration: 0.09, yoyo: true, repeat: 1 }, t);
      }
      this.arm(tl, at + 0.25 + count * 0.26, 'both', 0, 0.3, 'power2.out');
    },

    /** Помахать ручкой. */
    wave(tl, at, count = 3, side = 'R') {
      this.arm(tl, at, side, -35, 0.2);
      const r = side === 'L' ? -5 : 5;
      tl.to('#cr-arm' + side, { rotation: r, duration: 0.22, yoyo: true, repeat: count * 2 - 1, ease: 'sine.inOut' }, at + 0.2);
    },

    /** Спрятать румянец за левой ручкой (и вернуть её на место). */
    coverFace(tl, at, on = true) {
      tl.to('#cr-armL', on
        ? { x: S(70), y: S(-10), rotation: 0, duration: 0.3, ease: 'back.out(2)' }
        : { x: 0, y: 0, duration: 0.3, ease: 'power2.out' }, at);
      // на фоне тела ручка темнеет на тон, иначе её не видно
      tl.to(this.$('#cr-armL .limb'), { fill: on ? C.dark : C.body, duration: 0.2 }, at);
    },

    /** Показать / спрятать реквизит (pointer, glasses, mic, sign, popper, sticks). */
    prop(tl, at, name, on = true) {
      const t = name === 'sticks' ? this.$('.cr-stick') : '#cr-' + name;
      if (on) tl.to(t, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(3)' }, at);
      else tl.to(t, { autoAlpha: 0, scale: 0.2, duration: 0.2, ease: 'power2.in' }, at);
    }
  };

  window.Crab = Crab;
})();
