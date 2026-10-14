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
const suffix = Math.random().toString(36).slice(2, 6);
const codeA = await login(a, `Аня ${suffix}`);
const codeB = await login(b, `Борис ${suffix}`);
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
// кланы: Аня создаёт, Борис вступает по коду; рефссылка видна (Аня сейчас в кабинете, Борис в лобби)
await a.getByText('← Назад').click();
await a.getByText('← Покинуть комнату').click();
await a.getByTestId('account').click();
const refLink = await a.getByTestId('ref-link').inputValue();
await a.getByText('Клан').click();
await a.getByTestId('clan-name').fill('Семья Ивановых');
await a.getByTestId('clan-create').click();
await a.getByTestId('clan-view').waitFor({ timeout: 10000 });
const clanText = await a.getByTestId('clan-view').innerText();
const clanCode = clanText.match(/вступления\s+([A-Z2-9]{6})/)?.[1] ?? '';
await b.getByText('← Покинуть комнату').click();
await b.getByTestId('account').click();
await b.getByText('Клан').click();
await b.getByTestId('clan-code').fill(clanCode);
await b.getByTestId('clan-join').click();
await b.getByTestId('clan-view').waitFor({ timeout: 10000 });
const members = (await b.getByTestId('clan-view').innerText()).includes(`Аня ${suffix}`);
await b.screenshot({ path: 'e2e/shots/clan.png' });
console.log(JSON.stringify({ friendsOk: true, roomCode, joinedCode, sameRoom: roomCode === joinedCode, seats, refLink: refLink.includes(codeA), clanCode, clanJoined: members, errors }));
await browser.close();
if (roomCode !== joinedCode || !members || errors.length) process.exit(1);
