// E2E онлайн-комнаты: два браузера + робот. Нужны запущенные apps/server (3001) и vite dev (5173).
// Запуск: node e2e/online-room.mjs [baseUrl]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const SEL = '[data-testid^="reserve-"]:enabled, [data-testid^="piece-"]:enabled';
/** Синхронный клик по случайной доступной фигуре внутри страницы: без гонок с перерисовкой. */
const clickPiece = (page) => page.evaluate((sel) => { const els = [...document.querySelectorAll(sel)]; if (!els.length) return false; els[Math.floor(Math.random() * els.length)].click(); return true; }, SEL);
const browser = await chromium.launch();
const errors = [];
const mk = async (w, h) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return page;
};
const a = await mk(1280, 800);
const b = await mk(390, 844);

await a.goto(`${base}/?fast`);
await a.getByTestId('play-online').click();
await a.getByTestId('online-nick').fill('Аня');
await a.getByTestId('create-room').waitFor({ state: 'visible' });
await a.waitForFunction(() => !document.querySelector('[data-testid="create-room"]').disabled, null, { timeout: 10000 });
await a.getByTestId('create-room').click();
const code = (await a.getByTestId('room-code').innerText()).trim();
console.log('room code', code);

// B входит по ссылке-приглашению
await b.goto(`${base}/?room=${code}&fast`);
await b.getByTestId('online-nick').fill('Борис');
await b.waitForFunction(() => !document.querySelector('[data-testid="join-room"]').disabled, null, { timeout: 10000 });
await b.getByTestId('join-room').click();
await b.getByTestId('room-code').waitFor();
await a.getByTestId('seat-1').waitFor();

// хозяин добавляет робота и стартует
await a.getByTestId('add-bot').click();
await a.getByTestId('seat-2').waitFor();
await a.screenshot({ path: 'e2e/shots/lobby-desktop.png' });
await b.screenshot({ path: 'e2e/shots/lobby-mobile.png' });
await a.getByTestId('start-online').click();
await a.getByTestId('board').waitFor();
await b.getByTestId('board').waitFor();

// Борис перезагружает страницу в середине партии — должен вернуться в ту же партию
let reloaded = false;
const t0 = Date.now();
let steps = 0;
async function act(page) {
  const roll = page.getByTestId('roll');
  if (await roll.isEnabled().catch(() => false)) { await roll.click(); return true; }
  return clickPiece(page);
}
while (Date.now() - t0 < 300_000) {
  if (await a.getByTestId('victory').isVisible().catch(() => false)) break;
  const did = (await act(a)) || (await act(b));
  if (did) steps++;
  else await a.waitForTimeout(20);
  if (!reloaded && steps > 30) {
    await b.reload();
    await b.getByTestId('board').waitFor({ timeout: 15000 });
    reloaded = true;
    await b.screenshot({ path: 'e2e/shots/online-mobile-after-reload.png' });
  }
}
const victoryA = await a.getByTestId('victory').isVisible();
await b.getByTestId('victory').waitFor({ timeout: 10000 }).catch(() => {});
const victoryB = await b.getByTestId('victory').isVisible();
const statusA = await a.getByTestId('status').innerText();
const statusB = await b.getByTestId('status').innerText();
// оба клиента видят одинаковые броски: сравниваем последние записи журнала (на мобильном журнал свёрнут)
await b.evaluate(() => document.querySelector('[data-testid="log-toggle"]')?.click());
const logA = (await a.getByTestId('log').innerText()).split('\n').filter((l) => l.includes('выбросил')).slice(-20);
const logB = (await b.getByTestId('log').innerText()).split('\n').filter((l) => l.includes('выбросил')).slice(-20);
await a.screenshot({ path: 'e2e/shots/online-victory-desktop.png' });
console.log(JSON.stringify({ victoryA, victoryB, statusA, statusB, reloaded, steps, sameRolls: JSON.stringify(logA) === JSON.stringify(logB), seconds: ((Date.now() - t0) / 1000).toFixed(1), errors }));
await browser.close();
if (!victoryA || !victoryB || !reloaded || statusA !== statusB || errors.length) { console.error('ONLINE E2E FAILED'); process.exit(1); }
