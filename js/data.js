/* ==========================================================================
   data.js — ЕДИНСТВЕННОЕ место, где лежат цифры бенчмарка.
   Источник: https://artificialanalysis.ai/models
   (график «Artificial Analysis Intelligence Index», набор по умолчанию
   «27 of 704 models»). Снимок от 16.10.2026.

   Если рейтинг изменится — правьте только этот файл (см. README.md).
   ========================================================================== */

window.AA_DATA = {
  // --- Метаданные -----------------------------------------------------------
  date: '16.10.2026',
  indexName: 'Artificial Analysis Intelligence Index',
  indexVersion: 'v4.3.2',
  sourceUrl: 'artificialanalysis.ai',
  modelsOnChart: 27,     // столько моделей на графике по умолчанию
  modelsTotal: 704,      // «27 of 704 models»
  axisMax: 60,           // верх шкалы диаграммы (баллы)

  // --- Цвета лабораторий (сняты пипеткой с графика на сайте) ---------------
  labs: {
    Anthropic: { color: '#CC785C', text: '#FFFFFF' },
    Meta:      { color: '#0089F4', text: '#FFFFFF' },
    OpenAI:    { color: '#1F1F1F', text: '#FFFFFF' },
    Google:    { color: '#34A853', text: '#FFFFFF' },
    SpaceXAI:  { color: '#736CD3', text: '#FFFFFF' },
    Xiaomi:    { color: '#FF6900', text: '#FFFFFF' }
  },

  // --- Топ-10 по Intelligence Index (порядок как на сайте) -----------------
  // noApi: true — «No publicly available API» (на сайте столбик в клеточку).
  // При равенстве баллов порядок взят с графика сайта.
  models: [
    { rank: 1,  name: 'Claude Opus 5.5',   variant: '(max with fallback)', lab: 'Anthropic', score: 58 },
    { rank: 2,  name: 'Claude Sonnet 5.5', variant: '(max with fallback)', lab: 'Anthropic', score: 56 },
    { rank: 3,  name: 'Muse Wonder Full',  variant: '(max)',   lab: 'Meta',      score: 56, noApi: true },
    { rank: 4,  name: 'Claude Fable 5.1',  variant: '(max with fallback)', lab: 'Anthropic', score: 53 },
    { rank: 5,  name: 'GPT-6 Astra',       variant: '(max)',   lab: 'OpenAI',    score: 53 },
    { rank: 6,  name: 'Gemini 4 Argon',    variant: '(high)',  lab: 'Google',    score: 53 },
    { rank: 7,  name: 'Muse Wonder',       variant: '(max)',   lab: 'Meta',      score: 52 },
    { rank: 8,  name: 'GPT-6.1 Sol',       variant: '(max)',   lab: 'OpenAI',    score: 52 },
    { rank: 9,  name: 'Grok 4.7',          variant: '(xhigh)', lab: 'SpaceXAI',  score: 46 },
    { rank: 10, name: 'MiMo-V2.6-Pro',     variant: '',        lab: 'Xiaomi',    score: 46 }
  ],

  // --- Из чего состоит индекс (v4.3.2 — 10 тестов) -------------------------
  // icon — ключ иконки, которую рисует scenes.js (свой SVG, не логотипы).
  benchmarks: [
    { name: 'AA-Briefcase',      ru: 'Офисная работа агентом',  icon: 'case'   },
    { name: 'GDPval-AA',         ru: 'Реальные рабочие задачи', icon: 'chart'  },
    { name: 'AutomationBench',   ru: 'Автоматизация в SaaS',    icon: 'gear'   },
    { name: 'Terminal-Bench 4.0',ru: 'Код и терминал',          icon: 'term'   },
    { name: 'SciCode',           ru: 'Научный код',             icon: 'flask'  },
    { name: "Humanity's Last Exam", ru: 'Сложнейший экзамен',   icon: 'cap'    },
    { name: 'GDP.pdf',           ru: 'Работа с документами',    icon: 'doc'    },
    { name: 'CritPt',            ru: 'Физика',                  icon: 'atom'   },
    { name: 'AA-Omniscience',    ru: 'Знания без галлюцинаций', icon: 'brain'  },
    { name: 'AA-LCR',            ru: 'Длинный контекст',        icon: 'scroll' }
  ],

  // --- Реальные «фишки» для топ-3 -------------------------------------------
  // Всё взято с графиков того же снимка artificialanalysis.ai (16.10.2026):
  // отдельные бенчмарки, «Cost to Run Intelligence Index», «Pricing».
  extras: {
    hleOpus: 61,                // Humanity's Last Exam, Claude Opus 5.5 — №1 на графике
    indexCostOpus: '$8 708',    // стоимость прогона всего индекса, Claude Opus 5.5
    terminalSonnet: 64,         // Terminal-Bench 4.0, Claude Sonnet 5.5 — №1 на графике
    terminalOpus: 60,           // Terminal-Bench 4.0, Claude Opus 5.5
    priceSonnet: '$2 / $10',    // за 1M токенов: вход / выход
    priceOpus: '$4 / $20',
    critPtMuse: 33              // CritPt (физика), Muse Wonder Full — №1 на графике
  },

  note: 'Баллы округлены до целых, как на графике сайта.'
};

/* Короткие «фишки» для карточек — собираются из чисел выше,
   чтобы цифры не дублировались в коде сцен. */
(function (D) {
  const x = D.extras;
  D.facts = {
    1: [
      `№1 в Humanity's Last Exam — ${x.hleOpus}%`,
      `Прогон всего индекса — ${x.indexCostOpus}: умный, но не дешёвый`
    ],
    2: [
      `№1 в Terminal-Bench 4.0 — ${x.terminalSonnet}% (у Opus — ${x.terminalOpus}%)`,
      `Вдвое дешевле Opus: ${x.priceSonnet} против ${x.priceOpus} за 1M токенов`
    ],
    3: [
      `Лучшая на графике в физике: CritPt — ${x.critPtMuse}%`,
      'Публичного API нет — поэтому столбик «в клеточку»'
    ]
  };
})(window.AA_DATA);
