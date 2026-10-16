/* ==========================================================================
   export_cues.js — выгружает звуковые события ролика в audio/cues.json.

   Открывает index.html в headless Chromium (Playwright), ждёт сборки
   мастер-таймлайна и сохраняет Cues.list — абсолютные времена событий.
   Python-синтезатор (make_audio.py) строит звук по этому файлу.

   Запуск (из корня проекта):
     npm i -D playwright && npx playwright install chromium   # один раз
     node audio/export_cues.js
   Без интернета можно подложить локальный GSAP: GSAP=/путь/gsap.min.js
   ========================================================================== */

const path = require('path');
const fs = require('fs');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error('Нужен Playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

(async () => {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  if (process.env.GSAP) {
    await page.route('**/gsap.min.js', r =>
      r.fulfill({ path: process.env.GSAP, contentType: 'application/javascript' }));
  }
  // шрифты для звука не нужны — не ждём сеть
  await page.route('https://fonts.*/**', r => r.abort());

  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForFunction(() => !!(window.Cues && window.Cues.list), null, { timeout: 15000 });

  const out = await page.evaluate(() => ({
    duration: master.duration(),
    date: AA_DATA.date,
    cues: Cues.list
  }));
  await browser.close();

  if (errors.length) {
    console.error('Ошибки на странице:', errors);
    process.exit(1);
  }
  const file = path.join(__dirname, 'cues.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`cues.json: ${out.cues.length} событий, ${out.duration.toFixed(2)} с`);
})();
