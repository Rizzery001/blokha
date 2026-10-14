// E2E аккаунтов: dev-вход двух игроков, добавление в друзья, приглашение в комнату, вход по приглашению.
// Нужен сервер с DEV_LOGIN=1. Запуск: node e2e/friends.mjs [baseUrl]
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:3001';
const browser = await chromium.launch();
const errors = [];
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  return page;
};
const a = await mk();
const b = await mk();
const login = async (page, name) => {
  await page.goto(`${base}/?fast`);
  await page.getByTestId('account').click();
  await page.getByTestId('dev-name').fill(name);
  await page.getByTestId('dev-login').click();
  await page.getByTestId('friend-code').waitFor({ timeout: 10000 });
  return (await page.getByTestId('friend-code').innerText()).trim();
};
const codeA = await login(a, 'Аня');
const codeB = await login(b, 'Борис');
console.log('codes', codeA, codeB);
// Аня добавляет Бориса по коду; Борис принимает
await a.getByTestId('friend-query').fill(codeB);
await a.getByTestId('friend-add').click();
await b.getByText('Принять').waitFor({ timeout: 10000 });
await b.getByText('Принять').click();
await a.locator('[data-testid^="friend-"]').first().waitFor({ timeout: 10000 });
await a.screenshot({ path: 'e2e/shots/account-friends.png' });
// Аня создаёт комнату и зовёт Бориса
await a.getByText('← Назад').click();
await a.getByTestId('play-online').click();
await a.waitForFunction(() => !document.querySelector('[data-testid="create-room"]').disabled);
await a.getByTestId('create-room').click();
const roomCode = (await a.getByTestId('room-code').innerText()).trim();
await a.getByTestId('invite-friends').click();
await a.getByText('Позвать').click();
// Борис видит приглашение и входит
await b.getByTestId('invites').waitFor({ timeout: 10000 });
await b.screenshot({ path: 'e2e/shots/invite-toast.png' });
await b.getByText('Войти').click();
await b.getByTestId('room-code').waitFor({ timeout: 10000 });
const joinedCode = (await b.getByTestId('room-code').innerText()).trim();
const seats = await a.locator('[data-testid^="seat-"]').count();
console.log(JSON.stringify({ friendsOk: true, roomCode, joinedCode, sameRoom: roomCode === joinedCode, seats, errors }));
await browser.close();
if (roomCode !== joinedCode || errors.length) process.exit(1);
