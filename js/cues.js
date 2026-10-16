/* ==========================================================================
   cues.js — разметка звуковых событий. В браузере ничего не звучит:
   анимации только записывают «что и когда произошло», а звук целиком
   синтезирует Python-скрипт audio/make_audio.py по файлу audio/cues.json.

   Время в cue() — локальное для таймлайна сцены (как и в анимациях);
   main.js после сборки мастер-таймлайна переводит его в абсолютное.
   Выгрузка: node audio/export_cues.js  (см. README → «Звук»).
   ========================================================================== */

(function () {
  'use strict';

  const Cues = {
    _raw: [],

    /** Отметить звуковое событие type в момент at таймлайна tl. */
    cue(tl, at, type, data) {
      this._raw.push({ tl, at, type, data: data || {} });
    },

    /** Абсолютные времена относительно мастер-таймлайна, по возрастанию. */
    resolve(master) {
      this.list = this._raw
        .map((c, k) => ({ k, cue: Object.assign(
          { t: +((c.tl === master ? 0 : c.tl.startTime()) + c.at).toFixed(4), type: c.type },
          c.data) }))
        .sort((a, b) => a.cue.t - b.cue.t || a.k - b.k)
        .map(x => x.cue);
      return this.list;
    }
  };

  window.Cues = Cues;
})();
