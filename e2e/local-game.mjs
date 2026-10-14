// E2E smoke: полная локальная партия через реальный UI (без мокового движка).
// Запуск: node e2e/local-game.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const SEL = '[data-testid^="reserve-"]:enabled, [data-testid^="piece-"]:enabled';
/** Синхронный клик по случайной доступной фигуре внутри страницы: без гонок с перерисовкой. */
const clickPiece = (page) => page.evaluate((sel) => { const els = [...document.querySelectorAll(sel)]; if (!els.length) return false; els[Math.floor(Math.random() * els.length)].click(); return true; }, SEL);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

await page.goto(`${base}/?fast`);
await page.getByTestId('play-local').click();
await page.getByTestId('count-3').click();
// все три места — люди (hot seat)
await page.getByTestId('bot-1').click();
await page.getByTestId('bot-2').click();
await page.getByTestId('nick-0').fill('Мама');
await page.getByTestId('nick-1').fill('Папа');
await page.getByTestId('nick-2').fill('Дима');
await page.screenshot({ path: 'e2e/shots/setup-mobile.png' });
await page.getByTestId('start-game').click();
await page.getByTestId('board').waitFor();
await page.screenshot({ path: 'e2e/shots/game-start-mobile.png' });

let steps = 0;
let shotTaken = false;
const t0 = Date.now();
while (steps < 6000) {
  if (await page.getByTestId('victory').isVisible().catch(() => false)) break;
  const roll = page.getByTestId('roll');
  if (await roll.isEnabled().catch(() => false)) {
    await roll.click();
    steps++;
    continue;
  }
  if (!shotTaken && steps > 40 && (await page.locator(SEL).count()) > 0) {
    await page.screenshot({ path: 'e2e/shots/game-mid-mobile.png' });
    shotTaken = true;
  }
  if (await clickPiece(page)) {
    steps++;
    continue;
  }
  await page.waitForTimeout(15);
  if (Date.now() - t0 > 240_000) throw new Error('Партия не завершилась за 4 минуты');
}
const victory = await page.getByTestId('victory').isVisible();
const status = await page.getByTestId('status').innerText();
await page.screenshot({ path: 'e2e/shots/victory-mobile.png' });
const logLines = await page.getByTestId('log').locator('div').count();
console.log(JSON.stringify({ victory, status, steps, logLines, seconds: ((Date.now() - t0) / 1000).toFixed(1), errors }));

// десктопный скриншот
const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const dp = await desk.newPage();
await dp.goto(`${base}/?fast`);
await dp.getByTestId('play-local').click();
await dp.getByTestId('count-4').click();
await dp.getByTestId('start-game').click();
for (let i = 0; i < 60; i++) {
  if (await dp.getByTestId('roll').isEnabled().catch(() => false)) { await dp.getByTestId('roll').click(); continue; }
  if (await clickPiece(dp)) continue;
  await dp.waitForTimeout(15);
}
await dp.waitForTimeout(200);
await dp.screenshot({ path: 'e2e/shots/game-desktop-wood.png' });
await dp.getByTestId('toggle-theme').click();
await dp.screenshot({ path: 'e2e/shots/game-desktop-modern.png' });

// бросок кубика с реальными таймингами анимации (без ?fast): кадр в середине кувыркания
const anim = await desk.newPage();
await anim.goto(`${base}/`);
await anim.getByTestId('play-local').click();
await anim.getByTestId('start-game').click();
await anim.getByTestId('roll').click();
await anim.waitForTimeout(600);
await anim.screenshot({ path: 'e2e/shots/dice-throw-desktop.png' });
await anim.waitForTimeout(700);
await anim.screenshot({ path: 'e2e/shots/dice-landed-desktop.png' });
await browser.close();
if (!victory || errors.length) { console.error('E2E FAILED'); process.exit(1); }
