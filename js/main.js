/* ==========================================================================
   main.js — сборка мастер-таймлайна, масштабирование сцены под окно,
   панель управления (Play/Pause, Restart, перемотка, главы, горячие клавиши)
   и запись видео в .webm (getDisplayMedia + MediaRecorder).
   ========================================================================== */

(function () {
  'use strict';

  const DURATION = 60;
  // состояние записи (объявлено заранее — им пользуется автоскрытие панели)
  let recording = false, recorder = null, chunks = [], stream = null;
  const $ = s => document.querySelector(s);

  if (!window.gsap) {
    document.body.innerHTML = '<p style="color:#fff;font:20px sans-serif;padding:40px">' +
      'Не удалось загрузить GSAP с cdnjs.cloudflare.com — проверьте подключение к интернету.</p>';
    return;
  }

  // ---------------------------------------------------------------------------
  // 1. Масштабирование 1920×1080 → окно (letterbox)
  // ---------------------------------------------------------------------------
  const stage = $('#stage');
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / 1920, vh / 1080);
    stage.style.transform =
      `translate(${(vw - 1920 * s) / 2}px, ${(vh - 1080 * s) / 2}px) scale(${s})`;
  }
  window.addEventListener('resize', fit);
  fit();

  // ---------------------------------------------------------------------------
  // 2. Построение сцены и мастер-таймлайна
  // ---------------------------------------------------------------------------
  Crab.build();
  Chart.build();
  Scenes.build();

  const S = Scenes.START;
  const CHAPTERS = [
    ['intro', 'Интро'], ['aa', 'Что такое AA'], ['chart', 'Диаграмма'],
    ['third', '3 место'], ['second', '2 место'], ['first', '1 место'], ['final', 'Финал']
  ];

  const master = gsap.timeline({ paused: true, onUpdate: syncUI, onComplete: onDone });
  CHAPTERS.forEach(([k]) => master.addLabel(k, S[k]));

  master.add(Scenes.scene1(), 'intro');
  master.add(Scenes.scene2(), 'aa');
  master.add(Scenes.scene3(S.chart), 'chart');
  master.add(Scenes.scene4(S.third), 'third');
  master.add(Scenes.scene5(S.second), 'second');
  master.add(Scenes.scene6(S.first), 'first');
  master.add(Scenes.scene7(), 'final');

  // «Жизнь» крабика на всём ролике: дыхание и моргание раз в 2–4 с
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  Crab.idle(master, 0, DURATION - 1);
  Crab.blinkSchedule(master, 0, DURATION - 2, rnd);

  // расписание эмоций → абсолютное время мастера
  Crab.resolve(master);

  // звуковые события → абсолютное время (их читает Python-синтезатор)
  CHAPTERS.forEach(([k]) => Cues.cue(master, S[k], 'section', { name: k }));
  Cues.cue(master, DURATION, 'end');
  Cues.resolve(master);

  // ровно 60 секунд
  master.set({}, {}, DURATION);
  if (master.duration() > DURATION + 0.001) {
    console.warn('Таймлайн длиннее 60 с:', master.duration());
  }

  // Счётчики цифр считаются прямо от времени мастера — работают при любой перемотке
  const easeOut = gsap.parseEase('power2.out');
  function updateCounters(t) {
    Scenes.counters.forEach(c => {
      const p = Math.min(1, Math.max(0, (t - c.start) / c.dur));
      const v = String(Math.round(c.to * easeOut(p)));
      if (c.el.textContent !== v) c.el.textContent = v;
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Панель управления
  // ---------------------------------------------------------------------------
  const btnPlay = $('#btnPlay'), seek = $('#seek'), timer = $('#timer');
  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  function syncUI() {
    const t = master.time();
    updateCounters(t);
    Crab.sync(t);
    if (!seeking) seek.value = t;
    timer.textContent = `${fmt(t)} / ${fmt(DURATION)}`;
    btnPlay.textContent = master.paused() ? '►' : '❚❚';
  }

  function play() {
    if (master.time() >= DURATION - 0.01) master.seek(0, false);
    master.play();
    syncUI();
  }
  function pause() { master.pause(); syncUI(); }
  function toggle() { master.paused() ? play() : pause(); }
  function goTo(t) {
    t = Math.max(0, Math.min(DURATION, t));
    master.seek(t, false); // false — чтобы отработали onUpdate у вложенных анимаций
    syncUI();
  }

  btnPlay.addEventListener('click', toggle);
  $('#btnRestart').addEventListener('click', () => { goTo(0); master.play(); syncUI(); });

  let seeking = false, wasPlaying = false;
  seek.addEventListener('pointerdown', () => { seeking = true; wasPlaying = !master.paused(); master.pause(); });
  seek.addEventListener('input', () => goTo(parseFloat(seek.value)));
  seek.addEventListener('change', () => { seeking = false; if (wasPlaying) master.play(); syncUI(); });

  // Метки глав на ползунке
  const chapters = $('#chapters');
  CHAPTERS.forEach(([k, name]) => {
    const b = document.createElement('button');
    b.className = 'chap';
    b.style.left = (S[k] / DURATION * 100) + '%';
    b.title = `${name} — ${fmt(S[k])}`;
    b.innerHTML = `<span>${name}</span>`;
    b.addEventListener('click', () => goTo(S[k]));
    chapters.appendChild(b);
  });

  // Горячие клавиши: пробел — пауза, ←/→ — ±5 с
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); goTo(master.time() - 5); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); goTo(master.time() + 5); }
    poke();
  });

  // Автоскрытие панели через 2 с бездействия
  const controls = $('#controls');
  let hideTimer = null;
  function poke() {
    if (recording) return;
    controls.classList.remove('hidden');
    document.body.classList.remove('nocursor');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      controls.classList.add('hidden');
      document.body.classList.add('nocursor');
    }, 2000);
  }
  ['mousemove', 'pointerdown', 'touchstart'].forEach(ev => window.addEventListener(ev, poke, { passive: true }));
  controls.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  controls.addEventListener('mouseleave', poke);
  poke();

  // ---------------------------------------------------------------------------
  // 4. Запись видео (.webm)
  // ---------------------------------------------------------------------------
  const hint = $('#recHint');

  function showHint(text, ms = 3500) {
    hint.textContent = text;
    hint.classList.add('show');
    clearTimeout(showHint._t);
    if (ms) showHint._t = setTimeout(() => hint.classList.remove('show'), ms);
  }

  function pickMime() {
    const list = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return list.find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
  }

  async function startRecording() {
    if (recording) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      showHint('Браузер не поддерживает запись экрана (нужен Chrome / Edge / Firefox).');
      return;
    }
    pause();
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 60 },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include'
      });
    } catch (err) {
      showHint('Запись отменена.');
      return;
    }

    const track = stream.getVideoTracks()[0];
    // Если браузер умеет Region Capture — обрезаем кадр ровно по сцене 16:9
    try {
      if (window.CropTarget && track.cropTo) {
        const target = await CropTarget.fromElement(stage);
        await track.cropTo(target);
      }
    } catch (e) { /* не страшно: запишется вся вкладка */ }

    chunks = [];
    const mimeType = pickMime();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 16e6 } : undefined);
    recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = saveFile;
    track.addEventListener('ended', () => stopRecording());

    // прячем панель и курсор, ставим ролик в начало
    recording = true;
    document.body.classList.add('recording', 'nocursor');
    controls.classList.add('hidden');
    goTo(0);

    // даём браузеру пару кадров убрать панель — и поехали
    await new Promise(r => setTimeout(r, 400));
    recorder.start(100);
    master.play(0);
  }

  function stopRecording() {
    if (!recording) return;
    recording = false;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    if (stream) stream.getTracks().forEach(t => t.stop());
    document.body.classList.remove('recording');
    poke();
  }

  function saveFile() {
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `top3-ai-artificial-analysis-${AA_DATA.date}.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showHint('Готово! Видео сохранено в .webm');
  }

  function onDone() {
    syncUI();
    // небольшой «хвост», чтобы последний кадр точно попал в запись
    if (recording) setTimeout(stopRecording, 300);
  }

  $('#btnRec').addEventListener('click', startRecording);

  // ---------------------------------------------------------------------------
  // 5. Старт: ждём шрифты (чтобы облачка не «прыгали»), затем играем
  // ---------------------------------------------------------------------------
  goTo(0);
  const ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([ready, new Promise(r => setTimeout(r, 2500))]).then(() => {
    master.play(0);
    syncUI();
  });

  // для отладки из консоли
  window.master = master;
})();
