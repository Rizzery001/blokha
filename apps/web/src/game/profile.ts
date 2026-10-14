/**
 * Профили игроков на этом устройстве: опыт, уровни, достижения за всё время, открытая косметика,
 * задания дня, история партий. Хранятся в localStorage по имени игрока.
 */
import type { GameState, PlayerStats } from '@blokha/game-engine';

export interface Totals {
  games: number;
  wins: number;
  captures: number;
  captured: number;
  sixes: number;
  rolls: number;
  laps: number;
  finished: number;
  bonusCells: number;
  penaltyCells: number;
  winStreak: number;
  bestWinStreak: number;
  hardBotWins: number;
  comebackWins: number;
  bestSixStreak: number;
  achievementsInGame: number;
}

export interface GameRecord {
  at: number;
  month: string; // YYYY-MM
  players: { name: string; avatar: string; color: string; isBot: boolean; won: boolean }[];
  winner: string;
  rolls: number;
}

export interface Quest {
  id: string;
  title: string;
  target: number;
  xp: number;
  /** какой счётчик за день отслеживаем */
  metric: keyof DayCounters;
}

export interface DayCounters {
  games: number;
  wins: number;
  captures: number;
  sixes: number;
  laps: number;
  bonusCells: number;
  finished: number;
  lapsUnharmed: number;
}

export interface Profile {
  name: string;
  avatar: string;
  xp: number;
  totals: Totals;
  /** id достижения за всё время → когда открыто */
  unlocked: Record<string, number>;
  /** день → счётчики для заданий дня */
  day: { date: string; counters: DayCounters; claimed: string[] };
  createdAt: number;
  updatedAt: number;
}

export interface Store {
  profiles: Record<string, Profile>;
  history: GameRecord[];
  tutorialSeen: Record<string, boolean>;
  settings: { voice: boolean };
}

const KEY = 'blokha.store.v1';

export function emptyTotals(): Totals {
  return { games: 0, wins: 0, captures: 0, captured: 0, sixes: 0, rolls: 0, laps: 0, finished: 0, bonusCells: 0, penaltyCells: 0, winStreak: 0, bestWinStreak: 0, hardBotWins: 0, comebackWins: 0, bestSixStreak: 0, achievementsInGame: 0 };
}
export function emptyDay(date = today()): Profile['day'] {
  return { date, counters: { games: 0, wins: 0, captures: 0, sixes: 0, laps: 0, bonusCells: 0, finished: 0, lapsUnharmed: 0 }, claimed: [] };
}
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function monthKey(ts = Date.now()): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Store;
      s.profiles ??= {};
      s.history ??= [];
      s.tutorialSeen ??= {};
      s.settings ??= { voice: false };
      return s;
    }
  } catch {
    /* ignore */
  }
  return { profiles: {}, history: [], tutorialSeen: {}, settings: { voice: false } };
}
export function saveStore(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getProfile(store: Store, name: string, avatar = '🦊'): Profile {
  const key = name.trim().toLowerCase();
  let p = store.profiles[key];
  if (!p) {
    p = { name: name.trim(), avatar, xp: 0, totals: emptyTotals(), unlocked: {}, day: emptyDay(), createdAt: Date.now(), updatedAt: Date.now() };
    store.profiles[key] = p;
  }
  if (p.day.date !== today()) p.day = emptyDay();
  return p;
}

// ---------- уровни ----------
export const LEVEL_TITLES = ['Новичок', 'Блоха', 'Прыгун', 'Бегун по кругу', 'Охотник', 'Ветеран', 'Мастер', 'Гроссмейстер блохи', 'Легенда'];
export function xpForLevel(level: number): number {
  // суммарный опыт, нужный для достижения уровня (уровень 1 = 0)
  return Math.round(100 * Math.pow(level - 1, 1.5));
}
export function levelFromXp(xp: number): { level: number; title: string; into: number; need: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)]!, into: xp - base, need: next - base };
}

export const XP = { game: 20, win: 60, capture: 5, lap: 8, finished: 10, achievement: 15, lifetimeAchievement: 40, quest: 30 };

// ---------- достижения за всё время ----------
export interface LifetimeAchievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  metric: keyof Totals;
  target: number;
  /** открывает косметику */
  unlocks?: { kind: 'avatar' | 'pieceSet' | 'theme'; id: string; label: string };
}

export const LIFETIME: LifetimeAchievement[] = [
  { id: 'games-1', icon: '🎲', title: 'Первая партия', description: 'Сыграть партию', metric: 'games', target: 1 },
  { id: 'games-10', icon: '🎯', title: 'Завсегдатай', description: 'Сыграть 10 партий', metric: 'games', target: 10, unlocks: { kind: 'avatar', id: '🐙', label: 'аватар 🐙' } },
  { id: 'games-50', icon: '🏟️', title: 'Домашний турнир', description: 'Сыграть 50 партий', metric: 'games', target: 50, unlocks: { kind: 'avatar', id: '🎩', label: 'аватар 🎩' } },
  { id: 'wins-1', icon: '🏆', title: 'Первая победа', description: 'Выиграть партию', metric: 'wins', target: 1 },
  { id: 'wins-10', icon: '👑', title: 'Чемпион', description: 'Выиграть 10 партий', metric: 'wins', target: 10, unlocks: { kind: 'avatar', id: '🦄', label: 'аватар 🦄' } },
  { id: 'wins-25', icon: '💎', title: 'Династия', description: 'Выиграть 25 партий', metric: 'wins', target: 25, unlocks: { kind: 'pieceSet', id: 'king', label: 'набор «Короли»' } },
  { id: 'streak-3', icon: '🔥', title: 'Хет-трик', description: 'Три победы подряд', metric: 'bestWinStreak', target: 3, unlocks: { kind: 'avatar', id: '🔥', label: 'аватар 🔥' } },
  { id: 'captures-20', icon: '🏹', title: 'Снайпер', description: 'Выбить 20 фигур', metric: 'captures', target: 20, unlocks: { kind: 'pieceSet', id: 'queen', label: 'набор «Ферзи»' } },
  { id: 'captures-50', icon: '💀', title: 'Гроза доски', description: 'Выбить 50 фигур', metric: 'captures', target: 50, unlocks: { kind: 'avatar', id: '🐲', label: 'аватар 🐲' } },
  { id: 'captured-30', icon: '🛡️', title: 'Непотопляемый', description: 'Быть выбитым 30 раз и продолжать играть', metric: 'captured', target: 30, unlocks: { kind: 'avatar', id: '🛡️', label: 'аватар 🛡️' } },
  { id: 'sixes-100', icon: '🎰', title: 'Любимец кубика', description: 'Выбросить 100 шестёрок', metric: 'sixes', target: 100, unlocks: { kind: 'avatar', id: '🎰', label: 'аватар 🎰' } },
  { id: 'laps-20', icon: '🔄', title: 'Марафонец', description: 'Пройти 20 полных кругов', metric: 'laps', target: 20 },
  { id: 'hard-1', icon: '🤖', title: 'Победитель машин', description: 'Победить сильного робота', metric: 'hardBotWins', target: 1, unlocks: { kind: 'avatar', id: '🚀', label: 'аватар 🚀' } },
  { id: 'comeback-1', icon: '🐢', title: 'Камбэк', description: 'Победить, будучи последним по фигурам на финише в середине партии', metric: 'comebackWins', target: 1, unlocks: { kind: 'avatar', id: '🐢', label: 'аватар 🐢' } },
  { id: 'six-streak-3', icon: '⚡', title: 'Молния', description: 'Три шестёрки подряд', metric: 'bestSixStreak', target: 3 },
  { id: 'theme-modern', icon: '🎨', title: 'Дизайнер', description: 'Сыграть 3 партии', metric: 'games', target: 3, unlocks: { kind: 'theme', id: 'modern', label: 'тема Modern' } },
];

/** Что открыто профилю (базовый набор всегда доступен). */
export const BASE_AVATARS = ['🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🐵', '🐰', '🐨', '🦉', '🐧', '🦋', '🌻', '⭐', '🍕'];
export const BASE_PIECE_SETS = ['pawn', 'knight', 'rook', 'bishop'];
export const BASE_THEMES = ['wood', 'light'];

export function unlockedCosmetics(profile: Profile | null): { avatars: Set<string>; pieceSets: Set<string>; themes: Set<string> } {
  const avatars = new Set(BASE_AVATARS);
  const pieceSets = new Set(BASE_PIECE_SETS);
  const themes = new Set(BASE_THEMES);
  if (profile) {
    for (const a of LIFETIME) {
      if (profile.unlocked[a.id] && a.unlocks) {
        if (a.unlocks.kind === 'avatar') avatars.add(a.unlocks.id);
        if (a.unlocks.kind === 'pieceSet') pieceSets.add(a.unlocks.id);
        if (a.unlocks.kind === 'theme') themes.add(a.unlocks.id);
      }
    }
  }
  return { avatars, pieceSets, themes };
}

/** Кто открывает данную косметику (для подсказки на замке). */
export function unlockHint(kind: 'avatar' | 'pieceSet' | 'theme', id: string): string | null {
  const a = LIFETIME.find((x) => x.unlocks?.kind === kind && x.unlocks.id === id);
  return a ? `${a.icon} ${a.title}: ${a.description}` : null;
}

// ---------- задания дня ----------
const QUEST_POOL: Quest[] = [
  { id: 'q-games-2', title: 'Сыграть 2 партии', target: 2, xp: 30, metric: 'games' },
  { id: 'q-win-1', title: 'Выиграть партию', target: 1, xp: 40, metric: 'wins' },
  { id: 'q-cap-2', title: 'Выбить 2 фигуры в одной партии', target: 2, xp: 30, metric: 'captures' },
  { id: 'q-cap-5', title: 'Выбить 5 фигур за день', target: 5, xp: 40, metric: 'captures' },
  { id: 'q-six-6', title: 'Выбросить 6 шестёрок за день', target: 6, xp: 25, metric: 'sixes' },
  { id: 'q-lap-2', title: 'Пройти 2 полных круга', target: 2, xp: 30, metric: 'laps' },
  { id: 'q-bonus-3', title: 'Попасть на 3 бонусные клетки', target: 3, xp: 25, metric: 'bonusCells' },
  { id: 'q-fin-3', title: 'Довести 3 фигуры до крайней клетки финиша', target: 3, xp: 35, metric: 'finished' },
  { id: 'q-unharmed', title: 'Пройти круг, не будучи выбитым', target: 1, xp: 35, metric: 'lapsUnharmed' },
];

function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Три задания на день, одинаковые для всех на устройстве (зависят от даты). */
export function dailyQuests(date = today()): Quest[] {
  const rnd = seededRandom(Number(date.replace(/-/g, '')));
  const pool = [...QUEST_POOL];
  const out: Quest[] = [];
  while (out.length < 3 && pool.length > 0) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  return out;
}

// ---------- применение итогов партии ----------
export interface GameOutcomeForPlayer {
  name: string;
  avatar: string;
  won: boolean;
  stats: PlayerStats;
  beatHardBot: boolean;
  comeback: boolean;
  inGameAchievements: number;
}

export interface ProfileDelta {
  name: string;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  newLifetime: LifetimeAchievement[];
  questsDone: Quest[];
}

export function applyGameToProfile(store: Store, o: GameOutcomeForPlayer): ProfileDelta {
  const p = getProfile(store, o.name, o.avatar);
  const before = levelFromXp(p.xp).level;
  const t = p.totals;
  t.games += 1;
  if (o.won) {
    t.wins += 1;
    t.winStreak += 1;
    t.bestWinStreak = Math.max(t.bestWinStreak, t.winStreak);
  } else t.winStreak = 0;
  t.captures += o.stats.captures;
  t.captured += o.stats.captured;
  t.sixes += o.stats.sixes;
  t.rolls += o.stats.rolls;
  t.laps += o.stats.lapsCompleted;
  t.finished += o.stats.piecesFinished;
  t.bonusCells += o.stats.bonusCells;
  t.penaltyCells += o.stats.penaltyCells;
  t.bestSixStreak = Math.max(t.bestSixStreak, o.stats.bestSixStreak);
  if (o.won && o.beatHardBot) t.hardBotWins += 1;
  if (o.won && o.comeback) t.comebackWins += 1;
  t.achievementsInGame += o.inGameAchievements;

  let xp = XP.game + (o.won ? XP.win : 0) + o.stats.captures * XP.capture + o.stats.lapsCompleted * XP.lap + o.stats.piecesFinished * XP.finished + o.inGameAchievements * XP.achievement;

  const newLifetime: LifetimeAchievement[] = [];
  for (const a of LIFETIME) {
    if (!p.unlocked[a.id] && t[a.metric] >= a.target) {
      p.unlocked[a.id] = Date.now();
      newLifetime.push(a);
      xp += XP.lifetimeAchievement;
    }
  }

  // задания дня
  if (p.day.date !== today()) p.day = emptyDay();
  const c = p.day.counters;
  c.games += 1;
  if (o.won) c.wins += 1;
  c.captures += o.stats.captures;
  c.sixes += o.stats.sixes;
  c.laps += o.stats.lapsCompleted;
  c.bonusCells += o.stats.bonusCells;
  c.finished += o.stats.piecesFinished;
  if (o.stats.lapsCompleted > 0 && o.stats.captured === 0) c.lapsUnharmed += 1;
  const questsDone: Quest[] = [];
  for (const q of dailyQuests()) {
    if (!p.day.claimed.includes(q.id) && c[q.metric] >= q.target) {
      p.day.claimed.push(q.id);
      questsDone.push(q);
      xp += q.xp;
    }
  }

  p.xp += xp;
  p.avatar = o.avatar;
  p.updatedAt = Date.now();
  return { name: p.name, xpGained: xp, levelBefore: before, levelAfter: levelFromXp(p.xp).level, newLifetime, questsDone };
}

export function recordGame(store: Store, state: GameState, botIds: Set<string>) {
  const winner = state.players.find((p) => p.id === state.winnerId);
  store.history.push({
    at: Date.now(),
    month: monthKey(),
    players: state.players.map((p) => ({ name: p.nickname, avatar: p.avatar, color: p.color, isBot: botIds.has(p.id), won: p.id === state.winnerId })),
    winner: winner?.nickname ?? '',
    rolls: Object.values(state.stats ?? {}).reduce((a, s) => a + s.rolls, 0),
  });
  if (store.history.length > 500) store.history = store.history.slice(-500);
}

/** Таблица лидеров по истории: за всё время или за месяц. */
export function leaderboard(store: Store, month: string | null): { name: string; avatar: string; games: number; wins: number; rate: number; isBot: boolean }[] {
  const map = new Map<string, { name: string; avatar: string; games: number; wins: number; isBot: boolean }>();
  for (const g of store.history) {
    if (month && g.month !== month) continue;
    for (const pl of g.players) {
      const k = pl.name.toLowerCase();
      const e = map.get(k) ?? { name: pl.name, avatar: pl.avatar, games: 0, wins: 0, isBot: pl.isBot };
      e.games += 1;
      if (pl.won) e.wins += 1;
      e.avatar = pl.avatar;
      map.set(k, e);
    }
  }
  return [...map.values()].map((e) => ({ ...e, rate: e.games ? Math.round((e.wins / e.games) * 100) : 0 })).sort((a, b) => b.wins - a.wins || b.rate - a.rate || b.games - a.games);
}
