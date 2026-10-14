import { createServer, type Server as HttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import { ALL_REACTIONS, type Ack, type ClientToServerEvents, type Credentials, type ServerToClientEvents } from '@blokha/shared';
import { InMemoryRoomStore, type RoomStore } from './roomStore';
import { RoomError, RoomService } from './roomService';
import { AccountError, AccountService, verifyTelegramAuth, verifyWebAppInitData } from './accounts';
import { PRODUCTS, TelegramBot } from './telegram';
import { Db } from './db';

interface SocketData {
  creds?: Credentials;
  accountId?: number;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface BlokhaServerOptions {
  store?: RoomStore;
  staticDir?: string | null;
  botDelayMs?: number;
  dice?: () => number;
  random?: () => number;
  /** каталог для SQLite; null = база только в памяти */
  dataDir?: string | null;
  telegramBotToken?: string | undefined;
  telegramBotUsername?: string | undefined;
  /** разрешить вход без Telegram по имени (для разработки и тестов) */
  devLogin?: boolean;
  /** запускать опрос Telegram Bot API (платежи Stars, /start) */
  telegramPolling?: boolean;
  telegramApiBase?: string | undefined;
  webAppUrl?: string | undefined;
}

export interface BlokhaServer {
  http: HttpServer;
  io: IO;
  service: RoomService;
  accounts: AccountService;
  bot: TelegramBot | null;
  close(): Promise<void>;
}

function fail(code: RoomError['code'], message: string): Ack<never> {
  return { ok: false, error: { code, message } };
}

export async function createBlokhaServer(opts: BlokhaServerOptions = {}): Promise<BlokhaServer> {
  const store = opts.store ?? new InMemoryRoomStore();
  const db = await Db.open(opts.dataDir ?? null);
  const serviceOpts: ConstructorParameters<typeof RoomService>[0] = { store };
  if (opts.dice) serviceOpts.dice = opts.dice;
  if (opts.random) serviceOpts.random = opts.random;
  const service = new RoomService(serviceOpts);
  const botDelay = opts.botDelayMs ?? 1100;

  const app = express();
  app.use(express.json({ limit: '300kb' }));
  app.get('/health', (_req, res) => res.json({ ok: true, rooms: store.all().length }));

  // ---------- аккаунты (HTTP) ----------
  const onlineAccounts = new Map<number, number>(); // accountId → число сокетов
  const accounts = new AccountService(db, () => new Set(onlineAccounts.keys()));
  const tokenOf = (req: express.Request) => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || undefined;
  const apiError = (res: express.Response, e: unknown) => {
    if (e instanceof AccountError) return res.status(e.code === 'unauthorized' ? 401 : e.code === 'notFound' ? 404 : 400).json({ ok: false, error: { code: e.code, message: e.message } });
    console.error(e);
    return res.status(500).json({ ok: false, error: { code: 'internal', message: 'Внутренняя ошибка' } });
  };
  const bot = opts.telegramBotToken ? new TelegramBot({ token: opts.telegramBotToken, apiBase: opts.telegramApiBase, accounts, webAppUrl: opts.webAppUrl, log: (m) => console.error('[telegram]', m) }) : null;
  app.get('/api/config', (_req, res) => res.json({ ok: true, data: { telegramBot: opts.telegramBotUsername ?? null, devLogin: !!opts.devLogin, payments: !!bot } }));
  app.post('/api/auth/webapp', (req, res) => {
    try {
      if (!opts.telegramBotToken) throw new AccountError('badRequest', 'Вход через Telegram не настроен на сервере');
      const data = verifyWebAppInitData(String(req.body?.initData ?? ''), opts.telegramBotToken);
      const { account, token } = accounts.loginTelegram(data);
      res.json({ ok: true, data: { account, token } });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.get('/api/shop/products', (_req, res) => res.json({ ok: true, data: PRODUCTS }));
  app.get('/api/shop/purchases', (req, res) => {
    try {
      const me = accounts.authenticate(tokenOf(req));
      res.json({ ok: true, data: { purchases: accounts.purchases(me.id), premium: accounts.hasProduct(me.id, 'premium') } });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.post('/api/shop/invoice', async (req, res) => {
    try {
      const me = accounts.authenticate(tokenOf(req));
      if (!bot) throw new AccountError('badRequest', 'Платежи не настроены на сервере');
      const product = PRODUCTS.find((p) => p.id === String(req.body?.productId));
      if (!product) throw new AccountError('notFound', 'Товар не найден');
      if (product.kind === 'premium' && accounts.hasProduct(me.id, product.id)) throw new AccountError('badRequest', 'Премиум уже куплен');
      const link = await bot.createInvoiceLink(me.id, product);
      res.json({ ok: true, data: { link } });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.post('/api/auth/telegram', (req, res) => {
    try {
      if (!opts.telegramBotToken) throw new AccountError('badRequest', 'Вход через Telegram не настроен на сервере');
      const data = verifyTelegramAuth(req.body ?? {}, opts.telegramBotToken);
      const { account, token } = accounts.loginTelegram(data);
      res.json({ ok: true, data: { account, token } });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.post('/api/auth/dev', (req, res) => {
    try {
      if (!opts.devLogin) throw new AccountError('badRequest', 'Dev-вход выключен');
      const name = String(req.body?.name ?? '').trim().slice(0, 40);
      if (!name) throw new AccountError('badRequest', 'Введите имя');
      const { account, token } = accounts.loginDev(name);
      res.json({ ok: true, data: { account, token } });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.post('/api/auth/logout', (req, res) => {
    const t = tokenOf(req);
    if (t) accounts.logout(t);
    res.json({ ok: true });
  });
  app.get('/api/me', (req, res) => {
    try {
      const me = accounts.authenticate(tokenOf(req));
      res.json({ ok: true, data: { ...me, premium: accounts.hasProduct(me.id, 'premium') } });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.put('/api/me/avatar', (req, res) => {
    try {
      const me = accounts.authenticate(tokenOf(req));
      accounts.updateAvatar(me.id, String(req.body?.avatar ?? '🦊'));
      res.json({ ok: true, data: accounts.getAccount(me.id) });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.get('/api/profile', (req, res) => {
    try {
      const me = accounts.authenticate(tokenOf(req));
      res.json({ ok: true, data: accounts.getProfile(me.id) });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.put('/api/profile', (req, res) => {
    try {
      const me = accounts.authenticate(tokenOf(req));
      accounts.saveProfile(me.id, req.body ?? {});
      res.json({ ok: true });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.get('/api/friends', (req, res) => {
    try {
      const me = accounts.authenticate(tokenOf(req));
      res.json({ ok: true, data: accounts.friends(me.id) });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.post('/api/friends/request', (req, res) => {
    try {
      const me = accounts.authenticate(tokenOf(req));
      const r = accounts.requestFriend(me.id, String(req.body?.query ?? ''));
      notifyFriends(r.account.id);
      res.json({ ok: true, data: r });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.post('/api/friends/respond', (req, res) => {
    try {
      const me = accounts.authenticate(tokenOf(req));
      accounts.respondFriend(me.id, Number(req.body?.fromId), !!req.body?.accept);
      notifyFriends(Number(req.body?.fromId));
      res.json({ ok: true });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.post('/api/friends/remove', (req, res) => {
    try {
      const me = accounts.authenticate(tokenOf(req));
      accounts.removeFriend(me.id, Number(req.body?.id));
      notifyFriends(Number(req.body?.id));
      res.json({ ok: true });
    } catch (e) {
      apiError(res, e);
    }
  });
  app.get('/api/friends/leaderboard', (req, res) => {
    try {
      const me = accounts.authenticate(tokenOf(req));
      res.json({ ok: true, data: accounts.friendsLeaderboard(me.id) });
    } catch (e) {
      apiError(res, e);
    }
  });

  const accountFromToken = (t: unknown): number | null => {
    if (typeof t !== 'string' || !t) return null;
    try {
      return accounts.authenticate(t).id;
    } catch {
      return null;
    }
  };
  const staticDir = opts.staticDir === undefined ? path.resolve(process.cwd(), '../web/dist') : opts.staticDir;
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }
  const http = createServer(app);
  const io: IO = new Server(http, { cors: { origin: true }, pingInterval: 10000, pingTimeout: 15000 });
  const notifyFriends = (accountId: number) => {
    for (const s of io.sockets.sockets.values()) if (s.data.accountId === accountId) s.emit('friends:changed');
  };
  // партия завершена: записываем в базу аккаунтов для лидерборда друзей
  service.onFinish = (room) => {
    if (!room.game) return;
    const players = room.seats.map((seat) => ({ accountId: seat.isBot ? null : seat.accountId, name: seat.nickname, won: room.game!.winnerId === seat.playerId }));
    if (players.some((p) => p.accountId !== null)) accounts.recordGame(room.code, players);
  };

  const roomChannel = (code: string) => `room:${code}`;
  const broadcastRoom = (code: string) => {
    const room = store.get(code);
    if (room) io.to(roomChannel(code)).emit('room:state', service.snapshot(room));
  };

  const botTimers = new Map<string, NodeJS.Timeout>();
  const scheduleBots = (code: string) => {
    const room = store.get(code);
    if (!room || !service.isBotTurn(room)) return;
    if (botTimers.has(code)) return;
    const t = setTimeout(() => {
      botTimers.delete(code);
      try {
        const res = service.botStep(code);
        if (res) {
          io.to(roomChannel(code)).emit('game:update', res.update);
          if (res.room.status === 'finished') broadcastRoom(code);
          scheduleBots(code);
        }
      } catch (e) {
        console.error('bot step failed', e);
      }
    }, botDelay);
    botTimers.set(code, t);
  };

  const withAuth = <T>(socket: Sock, ack: (r: Ack<T>) => void, fn: (creds: Credentials) => Ack<T>) => {
    try {
      const creds = socket.data.creds;
      if (!creds) return ack(fail('badToken', 'Сначала войдите в комнату'));
      ack(fn(creds));
    } catch (e) {
      if (e instanceof RoomError) return ack(fail(e.code, e.message));
      console.error(e);
      ack(fail('badRequest', 'Внутренняя ошибка сервера'));
    }
  };

  io.on('connection', (socket: Sock) => {
    const attach = (creds: Credentials) => {
      socket.data.creds = creds;
      void socket.join(roomChannel(creds.code));
    };

    socket.on('auth:bind', (payload, ack) => {
      const id = accountFromToken(payload?.authToken);
      if (id === null) return ack(fail('badToken', 'Сессия не найдена'));
      if (socket.data.accountId !== id) {
        if (socket.data.accountId !== undefined) dropPresence(socket.data.accountId);
        socket.data.accountId = id;
        onlineAccounts.set(id, (onlineAccounts.get(id) ?? 0) + 1);
      }
      ack({ ok: true, data: { accountId: id } });
    });
    socket.on('friend:invite', (payload, ack) => {
      const me = socket.data.accountId;
      if (me === undefined) return ack(fail('badToken', 'Нужно войти'));
      const friendId = Number(payload?.friendId);
      if (!accounts.areFriends(me, friendId)) return ack(fail('badRequest', 'Это не ваш друг'));
      const code = String(payload?.code ?? '').toUpperCase();
      if (!store.get(code)) return ack(fail('roomNotFound', 'Комната не найдена'));
      const from = accounts.getAccount(me);
      let delivered = 0;
      for (const s of io.sockets.sockets.values()) {
        if (s.data.accountId === friendId) {
          s.emit('friend:invite', { fromName: from.name, fromAvatar: from.avatar, code, at: Date.now() });
          delivered++;
        }
      }
      ack(delivered > 0 ? { ok: true } : fail('badRequest', 'Друг сейчас не в игре'));
    });

    socket.on('room:create', (payload, ack) => {
      try {
        const { room, creds } = service.create(String(payload?.nickname ?? ''), accountFromToken(payload?.authToken));
        attach(creds);
        ack({ ok: true, data: { credentials: creds, room: service.snapshot(room) } });
        broadcastRoom(room.code);
      } catch (e) {
        ack(e instanceof RoomError ? fail(e.code, e.message) : fail('badRequest', 'Ошибка'));
      }
    });

    socket.on('room:join', (payload, ack) => {
      try {
        const { room, creds } = service.join(String(payload?.code ?? '').toUpperCase(), String(payload?.nickname ?? ''), accountFromToken(payload?.authToken));
        attach(creds);
        ack({ ok: true, data: { credentials: creds, room: service.snapshot(room) } });
        broadcastRoom(room.code);
      } catch (e) {
        ack(e instanceof RoomError ? fail(e.code, e.message) : fail('badRequest', 'Ошибка'));
      }
    });

    socket.on('room:resume', (payload, ack) => {
      try {
        const creds: Credentials = { code: String(payload?.code ?? ''), playerId: String(payload?.playerId ?? ''), token: String(payload?.token ?? '') };
        const { room } = service.resume(creds);
        attach(creds);
        ack({ ok: true, data: { credentials: creds, room: service.snapshot(room) } });
        broadcastRoom(room.code);
        scheduleBots(room.code);
      } catch (e) {
        ack(e instanceof RoomError ? fail(e.code, e.message) : fail('badRequest', 'Ошибка'));
      }
    });

    socket.on('room:updateSeat', (payload, ack) =>
      withAuth(socket, ack, (creds) => {
        const room = service.updateSeat(creds, payload ?? {});
        broadcastRoom(room.code);
        return { ok: true };
      }),
    );
    socket.on('room:addBot', (payload, ack) =>
      withAuth(socket, ack, (creds) => {
        broadcastRoom(service.addBot(creds, payload?.level ?? 'normal').code);
        return { ok: true };
      }),
    );
    socket.on('room:setBotLevel', (payload, ack) =>
      withAuth(socket, ack, (creds) => {
        broadcastRoom(service.setBotLevel(creds, String(payload?.playerId ?? ''), payload?.level ?? 'normal').code);
        return { ok: true };
      }),
    );
    socket.on('room:replaceWithBot', (payload, ack) =>
      withAuth(socket, ack, (creds) => {
        const room = service.replaceWithBot(creds, String(payload?.playerId ?? ''));
        broadcastRoom(room.code);
        scheduleBots(room.code);
        return { ok: true };
      }),
    );
    const lastReaction = new Map<string, number>();
    socket.on('room:react', (payload, ack) =>
      withAuth(socket, ack, (creds) => {
        const emoji = payload?.emoji;
        if (!ALL_REACTIONS.includes(emoji)) return fail('badRequest', 'Неизвестная реакция');
        const now = Date.now();
        const key = `${creds.code}:${creds.playerId}`;
        if (now - (lastReaction.get(key) ?? 0) < 1500) return { ok: true };
        lastReaction.set(key, now);
        const { room, playerId } = service.react(creds, emoji);
        io.to(roomChannel(room.code)).emit('room:reaction', { playerId, emoji, at: now });
        return { ok: true };
      }),
    );
    socket.on('room:removeBot', (payload, ack) =>
      withAuth(socket, ack, (creds) => {
        broadcastRoom(service.removeBot(creds, String(payload?.playerId ?? '')).code);
        return { ok: true };
      }),
    );
    socket.on('room:start', (_p, ack) =>
      withAuth(socket, ack, (creds) => {
        const { room, update } = service.start(creds);
        broadcastRoom(room.code);
        io.to(roomChannel(room.code)).emit('game:update', update);
        scheduleBots(room.code);
        return { ok: true };
      }),
    );
    socket.on('room:newGame', (_p, ack) =>
      withAuth(socket, ack, (creds) => {
        const room = service.newGame(creds);
        const t = botTimers.get(room.code);
        if (t) clearTimeout(t);
        botTimers.delete(room.code);
        broadcastRoom(room.code);
        return { ok: true };
      }),
    );
    socket.on('room:leave', (_p, ack) =>
      withAuth(socket, ack, (creds) => {
        const room = service.leave(creds);
        void socket.leave(roomChannel(creds.code));
        delete socket.data.creds;
        if (room) broadcastRoom(room.code);
        return { ok: true };
      }),
    );

    socket.on('game:roll', (payload, ack) =>
      withAuth(socket, ack, (creds) => {
        const { room, update } = service.roll(creds, Number(payload?.expectedVersion));
        io.to(roomChannel(room.code)).emit('game:update', update);
        if (room.status === 'finished') broadcastRoom(room.code);
        scheduleBots(room.code);
        return { ok: true, data: update };
      }),
    );
    socket.on('game:choose', (payload, ack) =>
      withAuth(socket, ack, (creds) => {
        const { room, update } = service.choose(creds, String(payload?.actionId ?? ''), Number(payload?.expectedVersion));
        io.to(roomChannel(room.code)).emit('game:update', update);
        if (room.status === 'finished') broadcastRoom(room.code);
        scheduleBots(room.code);
        return { ok: true, data: update };
      }),
    );

    socket.on('disconnect', () => {
      if (socket.data.accountId !== undefined) dropPresence(socket.data.accountId);
      const creds = socket.data.creds;
      if (!creds) return;
      // если тот же игрок уже подключён другим сокетом — не помечаем отключение
      const others = [...io.sockets.sockets.values()].some((s) => s !== socket && s.data.creds?.playerId === creds.playerId && s.data.creds?.code === creds.code);
      if (others) return;
      const room = service.setConnected(creds, false);
      if (room) broadcastRoom(room.code);
    });
  });

  const dropPresence = (id: number) => {
    const n = (onlineAccounts.get(id) ?? 1) - 1;
    if (n <= 0) onlineAccounts.delete(id);
    else onlineAccounts.set(id, n);
  };

  if (bot && opts.telegramPolling) bot.start();

  const sweeper = setInterval(() => service.sweep(), 10 * 60 * 1000);
  sweeper.unref();

  return {
    http,
    io,
    service,
    accounts,
    bot,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(sweeper);
        bot?.stop();
        for (const t of botTimers.values()) clearTimeout(t);
        db.close();
        io.close(() => resolve());
      }),
  };
}
