import { createHash, createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { AccountService, verifyTelegramAuth } from '../src/accounts';
import { Db } from '../src/db';
import { createBlokhaServer, type BlokhaServer } from '../src/server';

function sign(data: Record<string, string | number>, token: string) {
  const check = Object.keys(data).sort().map((k) => `${k}=${data[k]}`).join('\n');
  const secret = createHash('sha256').update(token).digest();
  return createHmac('sha256', secret).update(check).digest('hex');
}

describe('вход через Telegram', () => {
  it('принимает верную подпись и отвергает подделку и устаревшие данные', () => {
    const token = '123:ABC';
    const data = { id: 42, first_name: 'Дима', username: 'dzmitry', auth_date: Math.floor(Date.now() / 1000) };
    const ok = verifyTelegramAuth({ ...data, hash: sign(data, token) }, token);
    expect(ok.id).toBe(42);
    expect(() => verifyTelegramAuth({ ...data, hash: 'deadbeef' }, token)).toThrow(/Подпись/);
    const old = { ...data, auth_date: data.auth_date - 90000 };
    expect(() => verifyTelegramAuth({ ...old, hash: sign(old, token) }, token)).toThrow(/устарели/);
  });
});

describe('аккаунты и друзья', () => {
  it('логин создаёт аккаунт с кодом друга, заявки и встречные заявки, лидерборд друзей', async () => {
    const db = await Db.open(null);
    const svc = new AccountService(db, () => new Set([2]));
    const a = svc.loginDev('Аня');
    const b = svc.loginDev('Борис');
    const c = svc.loginDev('Вера');
    expect(a.account.friendCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(svc.authenticate(a.token).id).toBe(a.account.id);
    expect(() => svc.authenticate('nope')).toThrow(/войдите/);
    // заявка по коду
    expect(svc.requestFriend(a.account.id, b.account.friendCode).status).toBe('requested');
    expect(svc.friends(b.account.id).incoming.map((x) => x.id)).toEqual([a.account.id]);
    svc.respondFriend(b.account.id, a.account.id, true);
    expect(svc.areFriends(a.account.id, b.account.id)).toBe(true);
    expect(svc.friends(a.account.id).friends[0]).toMatchObject({ id: b.account.id, online: true });
    // встречная заявка = сразу друзья
    svc.requestFriend(c.account.id, a.account.friendCode);
    expect(svc.requestFriend(a.account.id, c.account.friendCode).status).toBe('accepted');
    expect(() => svc.requestFriend(a.account.id, a.account.friendCode)).toThrow(/сами/);
    expect(() => svc.requestFriend(a.account.id, 'ZZZZZZ')).toThrow(/не найден/);
    // партии и лидерборд
    svc.recordGame('ROOM01', [{ accountId: a.account.id, name: 'Аня', won: true }, { accountId: b.account.id, name: 'Борис', won: false }, { accountId: null, name: 'Робот', won: false }]);
    const lb = svc.friendsLeaderboard(b.account.id);
    expect(lb[0]!.account.id).toBe(a.account.id);
    expect(lb[0]!.wins).toBe(1);
    expect(svc.friends(b.account.id).friends.find((f) => f.id === a.account.id)).toMatchObject({ wins: 1, games: 1 });
    // профиль
    svc.saveProfile(a.account.id, { xp: 120 });
    expect(svc.getProfile(a.account.id)).toEqual({ xp: 120 });
    svc.removeFriend(a.account.id, b.account.id);
    expect(svc.areFriends(a.account.id, b.account.id)).toBe(false);
    db.close();
  });
});

describe('HTTP API и приглашения друзей через сокет', () => {
  let server: BlokhaServer;
  let url: string;
  beforeAll(async () => {
    server = await createBlokhaServer({ staticDir: null, botDelayMs: 5, devLogin: true });
    await new Promise<void>((r) => server.http.listen(0, r));
    const addr = server.http.address();
    url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });
  afterAll(async () => {
    await server.close();
  });
  const api = async (path: string, body?: unknown, token?: string) => {
    const r = await fetch(url + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return (await r.json()) as { ok: boolean; data?: any; error?: { code: string } };
  };
  it('вход, друзья, приглашение в комнату доходит до друга онлайн', async () => {
    const a = (await api('/api/auth/dev', { name: 'Аня' })).data;
    const b = (await api('/api/auth/dev', { name: 'Борис' })).data;
    expect((await api('/api/me', undefined, a.token)).data.name).toBe('Аня');
    expect((await api('/api/me')).error?.code).toBe('unauthorized');
    await api('/api/friends/request', { query: b.account.friendCode }, a.token);
    await api('/api/friends/respond', { fromId: a.account.id, accept: true }, b.token);
    // сокеты: Борис онлайн, Аня создаёт комнату и зовёт
    const sa = connect(url, { transports: ['websocket'], forceNew: true }) as Socket;
    const sb = connect(url, { transports: ['websocket'], forceNew: true }) as Socket;
    const bind = (s: Socket, t: string) => new Promise<any>((res) => s.emit('auth:bind', { authToken: t }, res));
    expect((await bind(sa, a.token)).ok).toBe(true);
    expect((await bind(sb, b.token)).ok).toBe(true);
    expect((await api('/api/friends', undefined, a.token)).data.friends[0]).toMatchObject({ id: b.account.id, online: true });
    const created = await new Promise<any>((res) => sa.emit('room:create', { nickname: 'Аня', authToken: a.token }, res));
    expect(created.data.room.seats[0].accountId).toBe(a.account.id);
    const invite = new Promise<any>((res) => sb.once('friend:invite', res));
    const ack = await new Promise<any>((res) => sa.emit('friend:invite', { friendId: b.account.id, code: created.data.credentials.code }, res));
    expect(ack.ok).toBe(true);
    expect(await invite).toMatchObject({ fromName: 'Аня', code: created.data.credentials.code });
    // Борис входит по приглашению с аккаунтом; повторный вход с другого сокета даёт то же место
    const joined = await new Promise<any>((res) => sb.emit('room:join', { code: created.data.credentials.code, nickname: 'Борис', authToken: b.token }, res));
    expect(joined.data.room.seats[1].accountId).toBe(b.account.id);
    const sb2 = connect(url, { transports: ['websocket'], forceNew: true }) as Socket;
    const joined2 = await new Promise<any>((res) => sb2.emit('room:join', { code: created.data.credentials.code, nickname: 'Борис', authToken: b.token }, res));
    expect(joined2.data.credentials.playerId).toBe(joined.data.credentials.playerId);
    sa.disconnect();
    sb.disconnect();
    sb2.disconnect();
  });
});
