import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, GameUpdate, JoinResult, RoomSnapshot, ServerToClientEvents } from '@blokha/shared';
import { createBlokhaServer, type BlokhaServer } from '../src/server';

type C = Socket<ServerToClientEvents, ClientToServerEvents>;

function emit<K extends keyof ClientToServerEvents>(s: C, ev: K, payload: Parameters<ClientToServerEvents[K]>[0]) {
  return new Promise<Ack<unknown>>((resolve) => (s as Socket).emit(ev, payload, resolve));
}
function once<K extends keyof ServerToClientEvents>(s: C, ev: K) {
  return new Promise<Parameters<ServerToClientEvents[K]>[0]>((resolve) => (s as Socket).once(ev as string, (v: Parameters<ServerToClientEvents[K]>[0]) => resolve(v)));
}

let server: BlokhaServer;
let url: string;
const diceSeq = [6, 2, 6, 1, 4, 3, 5];
let d = 0;

beforeAll(async () => {
  server = createBlokhaServer({ staticDir: null, botDelayMs: 5, dice: () => diceSeq[d++ % diceSeq.length]! });
  await new Promise<void>((r) => server.http.listen(0, r));
  const addr = server.http.address();
  url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(async () => {
  await server.close();
});

const client = () => connect(url, { transports: ['websocket'], forceNew: true }) as unknown as C;

describe('онлайн-комната через Socket.IO', () => {
  it('25. два клиента видят один результат кубика и одинаковое состояние; переподключение возвращает актуальное состояние', async () => {
    const a = client();
    const b = client();
    const created = (await emit(a, 'room:create', { nickname: 'Аня' })) as Ack<JoinResult>;
    expect(created.ok).toBe(true);
    const code = created.data!.credentials.code;
    const joined = (await emit(b, 'room:join', { code, nickname: 'Борис' })) as Ack<JoinResult>;
    expect(joined.ok).toBe(true);

    // гость не может начать партию
    const notHost = await emit(b, 'room:start', {});
    expect(notHost).toMatchObject({ ok: false, error: { code: 'notHost' } });

    const [updA, updB] = await Promise.all([once(a, 'game:update'), once(b, 'game:update'), emit(a, 'room:start', {})]);
    expect((updA as GameUpdate).version).toBe((updB as GameUpdate).version);

    // чужой ход отклоняется
    const wrong = await emit(b, 'game:roll', { expectedVersion: (updA as GameUpdate).version });
    expect(wrong).toMatchObject({ ok: false, error: { code: 'notYourTurn' } });

    // ход хозяина: оба клиента получают одно и то же значение кубика (6 по последовательности сервера)
    const [ra, rb, ack] = await Promise.all([once(a, 'game:update'), once(b, 'game:update'), emit(a, 'game:roll', { expectedVersion: (updA as GameUpdate).version })]);
    expect(ack.ok).toBe(true);
    const rolledA = (ra as GameUpdate).events.find((e) => e.type === 'rolled');
    const rolledB = (rb as GameUpdate).events.find((e) => e.type === 'rolled');
    expect(rolledA).toMatchObject({ value: 6 });
    expect(JSON.stringify(ra)).toBe(JSON.stringify(rb));

    // повтор той же команды (та же версия) отклонён
    const dup = await emit(a, 'game:roll', { expectedVersion: (updA as GameUpdate).version });
    expect(dup).toMatchObject({ ok: false, error: { code: 'staleVersion' } });

    // клиент не может подменить ход: присылает несуществующее действие
    const bad = await emit(a, 'game:choose', { actionId: 'move:hack', expectedVersion: (ra as GameUpdate).version });
    expect(bad).toMatchObject({ ok: false, error: { code: 'invalidAction' } });

    const spawn = (ra as GameUpdate).state.legalActions[0]!;
    const [ca] = await Promise.all([once(a, 'game:update'), once(b, 'game:update'), emit(a, 'game:choose', { actionId: spawn.id, expectedVersion: (ra as GameUpdate).version })]);

    // переподключение: B обрывает связь, A видит отключение, B возвращается по токену и получает актуальное состояние
    const disconnected = once(a, 'room:state');
    b.disconnect();
    const snap = (await disconnected) as RoomSnapshot;
    expect(snap.seats.find((s) => s.nickname === 'Борис')?.connected).toBe(false);

    const b2 = client();
    const resumed = (await emit(b2, 'room:resume', joined.data!.credentials)) as Ack<JoinResult>;
    expect(resumed.ok).toBe(true);
    expect(resumed.data!.room.game!.version).toBe((ca as GameUpdate).version);
    expect(resumed.data!.room.seats.find((s) => s.nickname === 'Борис')?.connected).toBe(true);

    // неверный токен
    const badToken = await emit(client(), 'room:resume', { ...joined.data!.credentials, token: 'nope' });
    expect(badToken).toMatchObject({ ok: false, error: { code: 'badToken' } });

    a.disconnect();
    b2.disconnect();
  });

  it('робот в комнате ходит сам и рассылает обновления', async () => {
    const a = client();
    const created = (await emit(a, 'room:create', { nickname: 'Один' })) as Ack<JoinResult>;
    const snapP = once(a, 'room:state');
    expect((await emit(a, 'room:addBot', {})).ok).toBe(true);
    const snap = (await snapP) as RoomSnapshot;
    expect(snap.seats.filter((s) => s.isBot)).toHaveLength(1);
    const started = once(a, 'game:update');
    await emit(a, 'room:start', {});
    let upd = (await started) as GameUpdate;
    // ходит человек: бросаем, пока очередь не перейдёт роботу
    for (let i = 0; i < 20; i++) {
      const cur = upd.state.turnOrder[upd.state.currentPlayerIndex];
      if (cur !== created.data!.credentials.playerId) break;
      if (upd.state.phase === 'awaitingRoll') {
        const next = once(a, 'game:update');
        await emit(a, 'game:roll', { expectedVersion: upd.version });
        upd = (await next) as GameUpdate;
      } else {
        const next = once(a, 'game:update');
        await emit(a, 'game:choose', { actionId: upd.state.legalActions[0]!.id, expectedVersion: upd.version });
        upd = (await next) as GameUpdate;
      }
    }
    // теперь ход робота — ждём его обновление без действий клиента
    const botUpd = (await once(a, 'game:update')) as GameUpdate;
    expect(botUpd.version).toBeGreaterThan(upd.version);
    expect(botUpd.events.some((e) => e.type === 'rolled')).toBe(true);
    a.disconnect();
  });
});
