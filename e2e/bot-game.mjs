// E2E локальной партии человека против трёх роботов.
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:5173';
const SEL = '[data-testid^="reserve-"]:enabled, [data-testid^="piece-"]:enabled';
/** Синхронный клик по случайной доступной фигуре внутри страницы: без гонок с перерисовкой. */
const clickPiece = (page) => page.evaluate((sel) => { const els = [...document.querySelectorAll(sel)]; if (!els.length) return false; els[Math.floor(Math.random() * els.length)].click(); return true; }, SEL);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/?fast`);
await page.getByTestId('play-local').click();
await page.getByTestId('count-4').click();
// по умолчанию места 2–4 — роботы
await page.screenshot({ path: 'e2e/shots/setup-bots-mobile.png' });
await page.getByTestId('start-game').click();
await page.getByTestId('board').waitFor();
const t0 = Date.now();
let myActions = 0;
while (Date.now() - t0 < 240_000) {
  if (await page.getByTestId('victory').isVisible().catch(() => false)) break;
  const roll = page.getByTestId('roll');
  if (await roll.isEnabled().catch(() => false)) { await roll.click(); myActions++; continue; }
  if (await clickPiece(page)) { myActions++; continue; }
  await page.waitForTimeout(20);
}
const victory = await page.getByTestId('victory').isVisible();
const status = await page.getByTestId('status').innerText();
console.log(JSON.stringify({ victory, status, myActions, seconds: ((Date.now() - t0) / 1000).toFixed(1), errors }));
await browser.close();
if (!victory || errors.length) process.exit(1);
