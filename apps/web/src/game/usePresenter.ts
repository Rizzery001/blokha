import { createGame, type Cell, type GameEvent, type GameState, type PlayerSetup } from '@blokha/game-engine';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface LogEntry {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'win';
}

/** Временные позиции фигур во время анимации движения (pieceId → клетка или '__reserve'). */
export type AnimOverrides = Record<string, Cell>;

/** Ускоренный режим для e2e-тестов: ?fast в адресе. Правила не меняются, только задержки анимации. */
export const FAST = typeof location !== 'undefined' && /[?&]fast/.test(location.search);
const STEP_MS = FAST ? 4 : 140;
export const DICE_SPIN_MS = FAST ? 10 : 650;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function describeEvent(state: GameState, e: GameEvent): LogEntry | null {
  const name = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? id;
  switch (e.type) {
    case 'gameStarted':
      return { id: 0, text: 'Партия началась', tone: 'info' };
    case 'turnStarted':
      return { id: 0, text: `Ход ${e.turnNumber}: ${name(e.playerId)}`, tone: 'info' };
    case 'turnSkipped':
      return { id: 0, text: `${name(e.playerId)} пропускает очередь (осталось пропусков: ${e.remainingSkips})`, tone: 'bad' };
    case 'rolled':
      return {
        id: 0,
        text: `${name(e.playerId)} выбросил ${e.value}${e.isBonusRoll ? ' (бонусный бросок)' : ''}${e.sixBonusGranted ? ' — шестёрка, +1 бросок' : ''}`,
        tone: e.sixBonusGranted ? 'good' : 'info',
      };
    case 'rollBurned':
      return { id: 0, text: `Все фигуры заблокированы; бросок ${e.value} сгорел`, tone: 'bad' };
    case 'spawned':
      return { id: 0, text: `${name(e.playerId)} выставил фигуру на ${e.cell}`, tone: 'info' };
    case 'moved':
      if (e.kind === 'autoForward') return { id: 0, text: `Бонус клетки ${e.from}: вперёд на ${e.to}`, tone: 'good' };
      if (e.kind === 'autoBackward') return { id: 0, text: `Штраф клетки ${e.from}: назад на ${e.to}`, tone: 'bad' };
      return { id: 0, text: `${name(e.playerId)}: ${e.from} → ${e.to}`, tone: 'info' };
    case 'captured':
      return { id: 0, text: `${name(e.byPlayerId)} выбил фигуру ${name(e.victimPlayerId)} на ${e.cell}`, tone: 'good' };
    case 'autoMoveCancelled':
      return { id: 0, text: `Авто-перемещение с ${e.cell} отменено: путь или клетка заняты`, tone: 'bad' };
    case 'turnBalance':
      return {
        id: 0,
        text:
          e.rolls > 0
            ? `${e.cell}: +${e.rolls} доп. бросок(а), всего бонусов: ${e.bonusRollsRemaining}`
            : `${e.cell}: штраф ${e.rolls} → бонусов ${e.bonusRollsRemaining}, пропусков ${e.skippedTurnsRemaining}`,
        tone: e.rolls > 0 ? 'good' : 'bad',
      };
    case 'gameFinished':
      return { id: 0, text: `🏆 Победа: ${name(e.winnerId)}!`, tone: 'win' };
  }
}

/** Общее для локальной и онлайн-игры: состояние, журнал, анимации. Расчёт движения — в движке/на сервере. */
export interface Presenter {
  state: GameState | null;
  log: LogEntry[];
  animating: boolean;
  overrides: AnimOverrides;
  lastRoll: number | null;
  rolling: boolean;
  flashCell: Cell | null;
  /** принять новое состояние с событиями: анимировать и опубликовать */
  ingest: (next: GameState, events: GameEvent[]) => Promise<void>;
  /** мгновенно показать состояние без анимации (восстановление) */
  setImmediate: (next: GameState | null, note?: string) => void;
  startFresh: (players: PlayerSetup[]) => { state: GameState; events: GameEvent[] };
  reset: () => void;
  stateRef: React.MutableRefObject<GameState | null>;
  /** показать «кубик крутится» (для онлайна — пока ждём сервер) */
  setRolling: (v: boolean) => void;
  busy: boolean;
}

export function usePresenter(): Presenter {
  const [state, setState] = useState<GameState | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [animating, setAnimating] = useState(false);
  const [overrides, setOverrides] = useState<AnimOverrides>({});
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [flashCell, setFlashCell] = useState<Cell | null>(null);
  const logId = useRef(1);
  const stateRef = useRef<GameState | null>(null);
  const mounted = useRef(true);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const pushLog = useCallback((s: GameState, events: GameEvent[]) => {
    const entries: LogEntry[] = [];
    for (const e of events) {
      const d = describeEvent(s, e);
      if (d) entries.push({ ...d, id: logId.current++ });
    }
    setLog((prev) => [...prev, ...entries].slice(-200));
  }, []);

  const commit = useCallback((s: GameState | null) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const animate = useCallback(async (next: GameState, events: GameEvent[]) => {
    setAnimating(true);
    const ov: AnimOverrides = {};
    for (const e of events) {
      if (!mounted.current) return;
      if (e.type === 'rolled') {
        setRolling(true);
        await sleep(DICE_SPIN_MS);
        setRolling(false);
        setLastRoll(e.value);
      } else if (e.type === 'moved') {
        for (const cell of e.path) {
          ov[e.pieceId] = cell;
          setOverrides({ ...ov });
          await sleep(STEP_MS);
        }
      } else if (e.type === 'spawned') {
        ov[e.pieceId] = e.cell;
        setOverrides({ ...ov });
        await sleep(STEP_MS);
      } else if (e.type === 'captured') {
        setFlashCell(e.cell);
        ov[e.victimPieceId] = '__reserve' as Cell;
        setOverrides({ ...ov });
        await sleep(STEP_MS * 3);
        setFlashCell(null);
      } else if (e.type === 'autoMoveCancelled') {
        setFlashCell(e.cell);
        await sleep(STEP_MS * 2);
        setFlashCell(null);
      }
    }
    setOverrides({});
    commit(next);
    pushLog(next, events);
    setAnimating(false);
  }, [commit, pushLog]);

  /** Обновления ставятся в очередь, чтобы быстрые ходы роботов/сервера не перемешивали анимации. */
  const ingest = useCallback(
    (next: GameState, events: GameEvent[]) => {
      const p = queue.current.then(() => animate(next, events));
      queue.current = p.catch(() => undefined);
      return p;
    },
    [animate],
  );

  const setImmediate = useCallback(
    (next: GameState | null, note?: string) => {
      setOverrides({});
      commit(next);
      if (note) setLog((prev) => [...prev, { id: logId.current++, text: note, tone: 'info' }]);
    },
    [commit],
  );

  const startFresh = useCallback(
    (players: PlayerSetup[]) => {
      const res = createGame({ players });
      setLog([]);
      setLastRoll(null);
      setOverrides({});
      commit(res.state);
      pushLog(res.state, res.events);
      return res;
    },
    [commit, pushLog],
  );

  const reset = useCallback(() => {
    commit(null);
    setLog([]);
    setOverrides({});
    setLastRoll(null);
    setRolling(false);
  }, [commit]);

  return { state, log, animating, overrides, lastRoll, rolling, flashCell, ingest, setImmediate, startFresh, reset, stateRef, setRolling, busy: animating || rolling };
}
