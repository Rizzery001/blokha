/** Разбор итогов партии: везение, шутливые титулы, применение к профилям. */
import type { GameState, PlayerStats } from '@blokha/game-engine';
import type { ReplayStep } from './usePresenter';
import { applyGameToProfile, loadStore, recordGame, saveStore, type ProfileDelta } from './profile';

export interface LuckRow {
  playerId: string;
  rolls: number;
  sixes: number;
  expected: number;
  delta: number;
}
export function luck(state: GameState): LuckRow[] {
  return state.players.map((p) => {
    const s = state.stats?.[p.id];
    const rolls = s?.rolls ?? 0;
    const sixes = s?.sixes ?? 0;
    const expected = rolls / 6;
    return { playerId: p.id, rolls, sixes, expected, delta: sixes - expected };
  });
}

export interface FunTitle {
  playerId: string;
  icon: string;
  title: string;
}
const SPECIAL_NAMES: Record<string, string> = { D1: 'вечно на D1', C8: 'постоялец C8', H7: 'друг клетки «5 назад»', A2: 'любитель трамплина A2', H5: 'завсегдатай H5', E8: 'коллекционер E8', F1: 'хозяин F1' };

export function funTitles(state: GameState, captureMatrix: Record<string, Record<string, number>>, landings: Record<string, Record<string, number>>): FunTitle[] {
  const out: FunTitle[] = [];
  const name = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? id;
  const st = (id: string): PlayerStats | undefined => state.stats?.[id];
  // мастер пропусков
  const pen = state.players.map((p) => ({ id: p.id, v: st(p.id)?.penaltyCells ?? 0 })).sort((a, b) => b.v - a.v)[0];
  if (pen && pen.v >= 2) out.push({ playerId: pen.id, icon: '🌧️', title: 'Мастер пропусков' });
  // охотник на конкретного соперника
  let best: { by: string; victim: string; n: number } | null = null;
  for (const [by, row] of Object.entries(captureMatrix)) for (const [victim, n] of Object.entries(row)) if (!best || n > best.n) best = { by, victim, n };
  if (best && best.n >= 2) out.push({ playerId: best.by, icon: '🎯', title: `Охотник на ${name(best.victim)}` });
  // вечно на клетке
  for (const p of state.players) {
    const row = landings[p.id] ?? {};
    const top = Object.entries(row).filter(([c]) => SPECIAL_NAMES[c]).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3) out.push({ playerId: p.id, icon: '📍', title: SPECIAL_NAMES[top[0]]!.replace(/^./, (ch) => ch.toUpperCase()) });
  }
  // домосед: больше всех сгоревших бросков
  const burned = state.players.map((p) => ({ id: p.id, v: st(p.id)?.burnedRolls ?? 0 })).sort((a, b) => b.v - a.v)[0];
  if (burned && burned.v >= 5) out.push({ playerId: burned.id, icon: '🛋️', title: 'Домосед' });
  // неуязвимый: ни разу не выбит при ≥ 2 кругах
  for (const p of state.players) {
    const s = st(p.id);
    if (s && s.captured === 0 && s.lapsCompleted >= 2) out.push({ playerId: p.id, icon: '👻', title: 'Невидимка' });
  }
  return out;
}

/** Камбэк: в момент, когда кто-то первым довёл 2 фигуры, у будущего победителя было 0 на финише. */
export function isComeback(steps: ReplayStep[], winnerId: string): boolean {
  for (const s of steps) {
    const stats = s.after.stats ?? {};
    const leader = Object.entries(stats).find(([, v]) => v.piecesFinished >= 2);
    if (leader) return leader[0] !== winnerId && (stats[winnerId]?.piecesFinished ?? 0) === 0;
  }
  return false;
}

export interface OutcomeApplied {
  deltas: ProfileDelta[];
}

/** Записать партию в историю и начислить опыт людям (роботы не получают профиль). */
export function applyOutcome(state: GameState, humanIds: string[], botIds: Set<string>, hardBotPresent: boolean, steps: ReplayStep[], inGameAchievements: Record<string, number>): OutcomeApplied {
  const store = loadStore();
  recordGame(store, state, botIds);
  const deltas: ProfileDelta[] = [];
  for (const id of humanIds) {
    const p = state.players.find((x) => x.id === id);
    const s = state.stats?.[id];
    if (!p || !s) continue;
    const won = state.winnerId === id;
    deltas.push(applyGameToProfile(store, { name: p.nickname, avatar: p.avatar, won, stats: s, beatHardBot: hardBotPresent, comeback: won && isComeback(steps, id), inGameAchievements: inGameAchievements[id] ?? 0 }));
  }
  saveStore(store);
  return { deltas };
}
