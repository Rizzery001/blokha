import { createServer, type Server as HttpServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import type { Ack, ClientToServerEvents, Credentials, ServerToClientEvents } from '@blokha/shared';
import { InMemoryRoomStore, type RoomStore } from './roomStore';
import { RoomError, RoomService } from './roomService';

interface SocketData {
  creds?: Credentials;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface BlokhaServerOptions {
  store?: RoomStore;
  staticDir?: string | null;
  botDelayMs?: number;
  dice?: () => number;
  random?: () => number;
}

export interface BlokhaServer {
  http: HttpServer;
  io: IO;
  service: RoomService;
  close(): Promise<void>;
}

function fail(code: RoomError['code'], message: string): Ack<never> {
  return { ok: false, error: { code, message } };
}

export function createBlokhaServer(opts: BlokhaServerOptions = {}): BlokhaServer {
  const store = opts.store ?? new InMemoryRoomStore();
  const serviceOpts: ConstructorParameters<typeof RoomService>[0] = { store };
  if (opts.dice) serviceOpts.dice = opts.dice;
  if (opts.random) serviceOpts.random = opts.random;
  const service = new RoomService(serviceOpts);
  const botDelay = opts.botDelayMs ?? 1100;

  const app = express();
  app.get('/health', (_req, res) => res.json({ ok: true, rooms: store.all().length }));
  const staticDir = opts.staticDir === undefined ? path.resolve(process.cwd(), '../web/dist') : opts.staticDir;
  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }
  const http = createServer(app);
  const io: IO = new Server(http, { cors: { origin: true }, pingInterval: 10000, pingTimeout: 15000 });

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

    socket.on('room:create', (payload, ack) => {
      try {
        const { room, creds } = service.create(String(payload?.nickname ?? ''));
        attach(creds);
        ack({ ok: true, data: { credentials: creds, room: service.snapshot(room) } });
        broadcastRoom(room.code);
      } catch (e) {
        ack(e instanceof RoomError ? fail(e.code, e.message) : fail('badRequest', 'Ошибка'));
      }
    });

    socket.on('room:join', (payload, ack) => {
      try {
        const { room, creds } = service.join(String(payload?.code ?? '').toUpperCase(), String(payload?.nickname ?? ''));
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
    socket.on('room:addBot', (_p, ack) =>
      withAuth(socket, ack, (creds) => {
        broadcastRoom(service.addBot(creds).code);
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
      const creds = socket.data.creds;
      if (!creds) return;
      // если тот же игрок уже подключён другим сокетом — не помечаем отключение
      const others = [...io.sockets.sockets.values()].some((s) => s !== socket && s.data.creds?.playerId === creds.playerId && s.data.creds?.code === creds.code);
      if (others) return;
      const room = service.setConnected(creds, false);
      if (room) broadcastRoom(room.code);
    });
  });

  const sweeper = setInterval(() => service.sweep(), 10 * 60 * 1000);
  sweeper.unref();

  return {
    http,
    io,
    service,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(sweeper);
        for (const t of botTimers.values()) clearTimeout(t);
        io.close(() => resolve());
      }),
  };
}
