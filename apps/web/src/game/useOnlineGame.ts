import type { Ack, ClientToServerEvents, Credentials, GameUpdate, JoinResult, RoomSnapshot, SeatUpdate, ServerToClientEvents } from '@blokha/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { usePresenter } from './usePresenter';
import type { GameController } from './useLocalGame';

type C = Socket<ServerToClientEvents, ClientToServerEvents>;

const CREDS_KEY = 'blokha.room';

export function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? (JSON.parse(raw) as Credentials) : null;
  } catch {
    return null;
  }
}
function saveCredentials(c: Credentials | null) {
  try {
    if (c) localStorage.setItem(CREDS_KEY, JSON.stringify(c));
    else localStorage.removeItem(CREDS_KEY);
  } catch {
    /* ignore */
  }
}

export function serverUrl(): string {
  const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
  return env.VITE_SERVER_URL || window.location.origin;
}

export type ConnStatus = 'connecting' | 'connected' | 'disconnected';

export interface OnlineGame extends GameController {
  room: RoomSnapshot | null;
  credentials: Credentials | null;
  conn: ConnStatus;
  create: (nickname: string) => Promise<string | null>;
  join: (code: string, nickname: string) => Promise<string | null>;
  updateSeat: (u: SeatUpdate) => Promise<string | null>;
  addBot: () => Promise<string | null>;
  removeBot: (playerId: string) => Promise<string | null>;
  start: () => Promise<string | null>;
  newGame: () => Promise<string | null>;
  leave: () => Promise<void>;
  clearError: () => void;
}

export function useOnlineGame(enabled: boolean): OnlineGame {
  const presenter = usePresenter();
  const { ingest, setImmediate, stateRef, reset } = presenter;
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(() => loadCredentials());
  const [conn, setConn] = useState<ConnStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<C | null>(null);
  const credsRef = useRef<Credentials | null>(credentials);
  const lastVersion = useRef(-1);
  credsRef.current = credentials;

  const emit = useCallback(<K extends keyof ClientToServerEvents>(ev: K, payload: Parameters<ClientToServerEvents[K]>[0]) => {
    return new Promise<Ack<unknown>>((resolve) => {
      const s = socketRef.current;
      if (!s) return resolve({ ok: false, error: { code: 'badRequest', message: 'Нет соединения' } });
      (s as Socket).timeout(8000).emit(ev, payload, (err: Error | null, r: Ack<unknown>) => {
        if (err) resolve({ ok: false, error: { code: 'badRequest', message: 'Сервер не ответил' } });
        else resolve(r);
      });
    });
  }, []);

  const applyJoin = useCallback(
    (r: Ack<unknown>): string | null => {
      if (!r.ok || !r.data) {
        setError(r.error?.message ?? 'Ошибка');
        return r.error?.message ?? 'Ошибка';
      }
      const data = r.data as JoinResult;
      setCredentials(data.credentials);
      saveCredentials(data.credentials);
      setRoom(data.room);
      if (data.room.game) {
        lastVersion.current = data.room.game.version;
        setImmediate(data.room.game, 'Состояние партии восстановлено');
      } else {
        lastVersion.current = -1;
        reset();
      }
      return null;
    },
    [reset, setImmediate],
  );

  useEffect(() => {
    if (!enabled) return;
    const s: C = io(serverUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = s;
    s.on('connect', () => {
      setConn('connected');
      const c = credsRef.current;
      if (c) {
        (s as Socket).emit('room:resume', c, (r: Ack<unknown>) => {
          if (!r.ok) {
            // комната пропала (например, перезапуск сервера) — забываем данные
            setCredentials(null);
            saveCredentials(null);
            setRoom(null);
            reset();
            setError(r.error?.message ?? 'Комната недоступна');
          } else applyJoin(r);
        });
      }
    });
    s.on('disconnect', () => setConn('disconnected'));
    s.on('connect_error', () => setConn('disconnected'));
    s.on('room:state', (snap) => {
      setRoom(snap);
      if (snap.status === 'lobby' && stateRef.current) reset();
    });
    s.on('game:update', (u: GameUpdate) => {
      if (u.version <= lastVersion.current) return; // дубликат
      lastVersion.current = u.version;
      void ingest(u.state, u.events);
    });
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [enabled, applyJoin, ingest, reset, stateRef]);

  const wrap = useCallback(
    async <K extends keyof ClientToServerEvents>(ev: K, payload: Parameters<ClientToServerEvents[K]>[0]) => {
      const r = await emit(ev, payload);
      if (!r.ok) {
        setError(r.error?.message ?? 'Ошибка');
        return r.error?.message ?? 'Ошибка';
      }
      return null;
    },
    [emit],
  );

  const create = useCallback(async (nickname: string) => applyJoin(await emit('room:create', { nickname })), [applyJoin, emit]);
  const join = useCallback(async (code: string, nickname: string) => applyJoin(await emit('room:join', { code, nickname })), [applyJoin, emit]);
  const updateSeat = useCallback((u: SeatUpdate) => wrap('room:updateSeat', u), [wrap]);
  const addBot = useCallback(() => wrap('room:addBot', {}), [wrap]);
  const removeBot = useCallback((playerId: string) => wrap('room:removeBot', { playerId }), [wrap]);
  const start = useCallback(() => wrap('room:start', {}), [wrap]);
  const newGame = useCallback(() => wrap('room:newGame', {}), [wrap]);
  const leave = useCallback(async () => {
    await emit('room:leave', {});
    setCredentials(null);
    saveCredentials(null);
    setRoom(null);
    lastVersion.current = -1;
    reset();
  }, [emit, reset]);

  const pending = useRef(false);
  const roll = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.phase !== 'awaitingRoll' || pending.current) return;
    pending.current = true;
    presenter.setRolling(true);
    void emit('game:roll', { expectedVersion: s.version }).then((r) => {
      pending.current = false;
      if (!r.ok) {
        presenter.setRolling(false);
        setError(r.error?.message ?? 'Ошибка');
      }
    });
  }, [emit, presenter, stateRef]);
  const choose = useCallback(
    (actionId: string) => {
      const s = stateRef.current;
      if (!s || s.phase !== 'awaitingAction' || pending.current) return;
      pending.current = true;
      void emit('game:choose', { actionId, expectedVersion: s.version }).then((r) => {
        pending.current = false;
        if (!r.ok) setError(r.error?.message ?? 'Ошибка');
      });
    },
    [emit, stateRef],
  );

  const botIds = useMemo(() => new Set(room?.seats.filter((s) => s.isBot).map((s) => s.playerId) ?? []), [room]);
  const disconnectedIds = useMemo(() => new Set(room?.seats.filter((s) => !s.isBot && !s.connected).map((s) => s.playerId) ?? []), [room]);

  return {
    ...presenter,
    myPlayerId: credentials?.playerId ?? null,
    botIds,
    disconnectedIds,
    roll,
    choose,
    error,
    room,
    credentials,
    conn,
    create,
    join,
    updateSeat,
    addBot,
    removeBot,
    start,
    newGame,
    leave,
    clearError: () => setError(null),
  };
}
