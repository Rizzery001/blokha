import { createGame, type Cell, type GameEvent, type GameState, type PlayerSetup } from '@blokha/game-engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { newAchievements, type Achievement } from './achievements';
import { sfx } from './sound';

export interface LogEntry {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'win';
}

/** Временные позиции фигур во время анимации движения (pieceId → клетка или '__reserve'). */
export type AnimOverrides = Record<string, Cell>;

/** Ускоренный режим для e2e-тестов: ?fast в адресе. Правила не меняются, только задержки анимации. */
export const FAST = typeof location !== 'undefined' && /[?&]fast/.test(location.search);
export const STEP_MS = FAST ? 4 : 190;
export const DICE_SPIN_MS = FAST ? 10 : 1100;
export const DICE_SETTLE_MS = FAST ? 0 : 650;

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
      {
        const owner = state.players.find((p) => p.id === e.playerId);
        const piece = owner?.pieces.find((p) => p.id === e.pieceId);
        const lap = state.config.perimeter.length;
        const idx = owner ? owner.pieces.findIndex((p) => p.id === e.pieceId) + 1 : 0;
        if (piece && piece.progress === lap) return { id: 0, text: `${name(e.playerId)}: фигура ${idx} ${e.from} → ${e.to}, полный круг пройден ✓`, tone: 'good' };
        if (piece && piece.progress !== null && piece.progress > lap) return { id: 0, text: `${name(e.playerId)}: фигура ${idx} ${e.from} → ${e.to} (финишная диагональ)`, tone: 'good' };
        return { id: 0, text: `${name(e.playerId)}: фигура ${idx} ${e.from} → ${e.to}`, tone: 'info' };
      }
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

export interface Notice {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'info' | 'achievement';
  icon?: string;
}

/** Стрелка авто-перемещения, показываемая поверх доски во время анимации. */
export interface ArrowOverlay {
  from: Cell;
  to: Cell;
  kind: 'autoForward' | 'autoBackward';
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
  notices: Notice[];
  arrow: ArrowOverlay | null;
  /** клетка, на которой только что произошло выбивание (для эффекта) */
  captureCell: Cell | null;
  /** тряска доски (выбивание) */
  shake: boolean;
  /** достижения за партию: playerId → список */
  achievements: Record<string, Achievement[]>;
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
  const [notices, setNotices] = useState<Notice[]>([]);
  const [arrow, setArrow] = useState<ArrowOverlay | null>(null);
  const [captureCell, setCaptureCell] = useState<Cell | null>(null);
  const logId = useRef(1);
  const noticeId = useRef(1);
  const [shake, setShake] = useState(false);
  const [achievements, setAchievements] = useState<Record<string, Achievement[]>>({});
  const notify = useCallback((text: string, tone: Notice['tone'], icon?: string) => {
    const id = noticeId.current++;
    const n: Notice = { id, text, tone };
    if (icon) n.icon = icon;
    setNotices((prev) => [...prev.slice(-3), n]);
    setTimeout(() => setNotices((prev) => prev.filter((x) => x.id !== id)), FAST ? 50 : tone === 'achievement' ? 3600 : 2600);
  }, []);
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
      const name = (id: string) => next.players.find((p) => p.id === id)?.nickname ?? id;
      if (e.type === 'rolled') {
        setRolling(true);
        sfx.dice();
        await sleep(DICE_SPIN_MS);
        setLastRoll(e.value);
        setRolling(false);
        sfx.land();
        if (e.sixBonusGranted) {
          notify('Шестёрка! +1 бросок', 'good');
          sfx.six();
        }
        await sleep(DICE_SETTLE_MS);
      } else if (e.type === 'moved') {
        if (e.kind !== 'normal') {
          setArrow({ from: e.from, to: e.to, kind: e.kind });
          notify(e.kind === 'autoForward' ? `${e.from}: ${e.path.length} вперёд!` : `${e.from}: ${e.path.length} назад`, e.kind === 'autoForward' ? 'good' : 'bad');
          if (e.kind === 'autoForward') sfx.autoForward();
          else sfx.autoBackward();
          await sleep(FAST ? 0 : 350);
        }
        for (const cell of e.path) {
          ov[e.pieceId] = cell;
          setOverrides({ ...ov });
          sfx.step();
          await sleep(STEP_MS);
        }
        if (e.kind === 'normal') {
          const owner = next.players.find((p) => p.id === e.playerId);
          const piece = owner?.pieces.find((p) => p.id === e.pieceId);
          const lap = next.config.perimeter.length;
          if (owner && piece && piece.progress === lap) {
            notify(`${owner.nickname}: фигура прошла полный круг — теперь может идти на диагональ`, 'good');
          }
        }
        if (e.kind !== 'normal') {
          await sleep(FAST ? 0 : 250);
          setArrow(null);
        }
      } else if (e.type === 'spawned') {
        ov[e.pieceId] = e.cell;
        setOverrides({ ...ov });
        sfx.spawn();
        await sleep(STEP_MS);
      } else if (e.type === 'captured') {
        setFlashCell(e.cell);
        setCaptureCell(e.cell);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        sfx.capture();
        notify(`${name(e.byPlayerId)} выбил фигуру: ${name(e.victimPlayerId)} → в резерв`, 'good');
        await sleep(STEP_MS * 2);
        ov[e.victimPieceId] = '__reserve' as Cell;
        setOverrides({ ...ov });
        await sleep(STEP_MS * 3);
        setFlashCell(null);
        setCaptureCell(null);
      } else if (e.type === 'autoMoveCancelled') {
        setFlashCell(e.cell);
        notify(`${e.cell}: путь занят, бонус отменён`, 'bad');
        await sleep(STEP_MS * 3);
        setFlashCell(null);
      } else if (e.type === 'rollBurned') {
        notify(`Ходов нет: бросок ${e.value} сгорел`, 'bad');
        sfx.burned();
        await sleep(FAST ? 0 : 500);
      } else if (e.type === 'turnBalance') {
        if (e.rolls > 0) sfx.bonus();
        else sfx.penalty();
        notify(e.rolls > 0 ? `${e.cell}: +${e.rolls} доп. ${e.rolls === 1 ? 'бросок' : 'броска'}` : `${e.cell}: пропуск ${-e.rolls} → бонусов ${e.bonusRollsRemaining}, пропусков ${e.skippedTurnsRemaining}`, e.rolls > 0 ? 'good' : 'bad');
        await sleep(FAST ? 0 : 500);
      } else if (e.type === 'turnSkipped') {
        notify(`${name(e.playerId)} пропускает очередь`, 'bad');
        await sleep(FAST ? 0 : 500);
      } else if (e.type === 'gameFinished') {
        sfx.win();
      }
    }
    setOverrides({});
    // достижения: сравниваем статистику до и после
    const earned = newAchievements(stateRef.current, next);
    if (earned.length > 0) {
      setAchievements((prev) => {
        const copy = { ...prev };
        for (const { playerId, achievement } of earned) {
          const list = copy[playerId] ?? [];
          if (!list.some((a) => a.id === achievement.id)) copy[playerId] = [...list, achievement];
        }
        return copy;
      });
      for (const { playerId, achievement } of earned) {
        notify(`${next.players.find((p) => p.id === playerId)?.nickname ?? ''}: ${achievement.title} — ${achievement.description}`, 'achievement', achievement.icon);
      }
      sfx.achievement();
    }
    commit(next);
    pushLog(next, events);
    setAnimating(false);
  }, [commit, pushLog, notify]);

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
      setAchievements({});
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
    setAchievements({});
  }, [commit]);

  return { state, log, animating, overrides, lastRoll, rolling, flashCell, notices, arrow, captureCell, shake, achievements, ingest, setImmediate, startFresh, reset, stateRef, setRolling, busy: animating || rolling };
}
