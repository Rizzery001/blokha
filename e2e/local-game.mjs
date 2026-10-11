// E2E smoke: полная локальная партия через реальный UI (без мокового движка).
// Запуск: node e2e/local-game.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${base}/?fast`);
await page.getByTestId('play-local').click();
await page.getByTestId('count-3').click();
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
  // выбираем любую подсвеченную фигуру: сначала резерв, потом на доске
  const reserve = page.locator('[data-testid^="reserve-"]:enabled');
  const onBoard = page.locator('[data-testid^="piece-"]:enabled');
  const choices = [];
  for (const loc of [reserve, onBoard]) {
    const n = await loc.count();
    for (let i = 0; i < n; i++) choices.push(loc.nth(i));
  }
  if (choices.length > 0) {
    if (!shotTaken && steps > 40) {
      await page.screenshot({ path: 'e2e/shots/game-mid-mobile.png' });
      shotTaken = true;
    }
    const pick = choices[Math.floor(Math.random() * choices.length)];
    await pick.click({ force: true });
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
  const c = dp.locator('[data-testid^="reserve-"]:enabled, [data-testid^="piece-"]:enabled');
  if (await c.count()) { await c.first().click({ force: true }); continue; }
  await dp.waitForTimeout(15);
}
await dp.waitForTimeout(200);
await dp.screenshot({ path: 'e2e/shots/game-desktop-wood.png' });
await dp.getByTestId('toggle-theme').click();
await dp.screenshot({ path: 'e2e/shots/game-desktop-modern.png' });
await browser.close();
if (!victory || errors.length) { console.error('E2E FAILED'); process.exit(1); }
