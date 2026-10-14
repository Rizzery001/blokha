/**
 * Профили игроков на этом устройстве: опыт, уровни, достижения за всё время, открытая косметика,
 * задания дня, история партий. Хранятся в localStorage по имени игрока.
 */
import type { Corner, GameState, PlayerStats } from '@blokha/game-engine';
import { ALL_ITEMS, itemKey, rollChest, type Item } from './collection';
import type { Challenge } from './challenges';

export type NumericTotal = Exclude<keyof Totals, 'winsByCorner' | 'penaltyByCell'>;

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
  /** побед по стартовому углу */
  winsByCorner: Record<string, number>;
  /** попаданий на штрафные клетки по клеткам */
  penaltyByCell: Record<string, number>;
  /** суммарно бросков во всех партиях, чтобы считать среднюю длину */
  turnsTotal: number;
  chestsOpened: number;
  loginDays: number;
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
  /** ежедневная серия входов */
  streak: { last: string; count: number; claimedToday: boolean };
  /** неоткрытые сундуки */
  chests: number;
  /** инвентарь: ключ предмета → количество */
  items: Record<string, number>;
  /** выбранная рамка профиля */
  frame: string;
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
  return { games: 0, wins: 0, captures: 0, captured: 0, sixes: 0, rolls: 0, laps: 0, finished: 0, bonusCells: 0, penaltyCells: 0, winStreak: 0, bestWinStreak: 0, hardBotWins: 0, comebackWins: 0, bestSixStreak: 0, achievementsInGame: 0, winsByCorner: {}, penaltyByCell: {}, turnsTotal: 0, chestsOpened: 0, loginDays: 0 };
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
    p = { name: name.trim(), avatar, xp: 0, streak: { last: '', count: 0, claimedToday: false }, chests: 0, items: {}, frame: 'none', totals: emptyTotals(), unlocked: {}, day: emptyDay(), createdAt: Date.now(), updatedAt: Date.now() };
    store.profiles[key] = p;
  }
  // миграция старых профилей
  p.streak ??= { last: '', count: 0, claimedToday: false };
  p.chests ??= 0;
  p.items ??= {};
  p.frame ??= 'none';
  p.totals = { ...emptyTotals(), ...p.totals };
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
  metric: NumericTotal;
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
  { id: 'chests-10', icon: '🎁', title: 'Кладоискатель', description: 'Открыть 10 сундуков', metric: 'chestsOpened', target: 10 },
  { id: 'login-7', icon: '📅', title: 'Неделя подряд', description: 'Заходить в игру 7 дней', metric: 'loginDays', target: 7, unlocks: { kind: 'avatar', id: '🧿', label: 'аватар 🧿' } },
  { id: 'login-30', icon: '🗓️', title: 'Месяц с Блохой', description: 'Заходить в игру 30 дней', metric: 'loginDays', target: 30 },
];

/** Личная статистика как достижения: по углам и клеткам. */
export interface PersonalAchievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  value: string;
  done: boolean;
}
export function personalAchievements(p: Profile): PersonalAchievement[] {
  const t = p.totals;
  const out: PersonalAchievement[] = [];
  const cornerName: Record<string, string> = { A1: 'Угол 1', H1: 'Угол 2', H8: 'Угол 3', A8: 'Угол 4' };
  const corners = Object.entries(t.winsByCorner ?? {}).sort((a, b) => b[1] - a[1]);
  if (corners.length > 0) {
    const [c, n] = corners[0]!;
    out.push({ id: 'fav-corner', icon: '📐', title: `Хозяин: ${cornerName[c] ?? c}`, description: 'Любимый угол: больше всего побед отсюда', value: `${n} побед`, done: n >= 3 });
  }
  for (const [c, label] of Object.entries(cornerName)) {
    const n = t.winsByCorner?.[c] ?? 0;
    out.push({ id: `corner-${c}`, icon: '🏠', title: `Победа с каждого угла: ${label}`, description: 'Выиграть, стартуя с этого угла', value: n > 0 ? `${n}` : '—', done: n > 0 });
  }
  const cells = Object.entries(t.penaltyByCell ?? {}).sort((a, b) => b[1] - a[1]);
  if (cells.length > 0) out.push({ id: 'unlucky-cell', icon: '🌧️', title: `Несчастная клетка: ${cells[0]![0]}`, description: 'Чаще всего попадаете на эту штрафную клетку', value: `${cells[0]![1]} раз`, done: cells[0]![1] >= 5 });
  if (t.games > 0) out.push({ id: 'avg-len', icon: '⏱️', title: 'Средняя длина партии', description: 'Бросков на партию (всех игроков)', value: `${Math.round(t.turnsTotal / t.games)}`, done: t.games >= 5 });
  if (t.rolls > 0) out.push({ id: 'six-rate', icon: '🎲', title: 'Доля шестёрок', description: 'Норма ≈ 16,7 %', value: `${((t.sixes / t.rolls) * 100).toFixed(1)} %`, done: t.rolls >= 100 });
  if (t.games > 0) out.push({ id: 'winrate', icon: '📈', title: 'Процент побед', description: 'За всё время', value: `${Math.round((t.wins / t.games) * 100)} %`, done: t.games >= 10 });
  return out;
}

/** Что открыто профилю (базовый набор всегда доступен). */
export const BASE_AVATARS = ['🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🐵', '🐰', '🐨', '🦉', '🐧', '🦋', '🌻', '⭐', '🍕'];
export const BASE_PIECE_SETS = ['pawn', 'knight', 'rook', 'bishop'];
export const BASE_THEMES = ['wood', 'light'];

let premiumGlobal = false;
/** Премиум куплен в аккаунте: вся косметика открыта (хранится в памяти и в localStorage до следующей проверки). */
export function setPremium(v: boolean) {
  premiumGlobal = v;
  try {
    localStorage.setItem('blokha.premium', v ? '1' : '0');
  } catch {
    /* ignore */
  }
}
export function isPremium(): boolean {
  if (premiumGlobal) return true;
  try {
    return localStorage.getItem('blokha.premium') === '1';
  } catch {
    return false;
  }
}

export function unlockedCosmetics(profile: Profile | null): { avatars: Set<string>; pieceSets: Set<string>; themes: Set<string> } {
  if (isPremium()) {
    return { avatars: new Set([...BASE_AVATARS, ...LIFETIME.filter((a) => a.unlocks?.kind === 'avatar').map((a) => a.unlocks!.id), ...ALL_ITEMS.filter((i) => i.kind === 'avatar').map((i) => i.id)]), pieceSets: new Set(['pawn', 'knight', 'rook', 'bishop', 'queen', 'king']), themes: new Set(ALL_ITEMS.filter((i) => i.kind === 'board').map((i) => i.id)) };
  }
  const avatars = new Set(BASE_AVATARS);
  const pieceSets = new Set(BASE_PIECE_SETS);
  const themes = new Set(BASE_THEMES);
  if (profile) {
    for (const key of Object.keys(profile.items ?? {})) {
      const [kind, id] = key.split(':');
      if (kind === 'avatar' && id) avatars.add(id);
      if (kind === 'pieceSet' && id) pieceSets.add(id);
      if (kind === 'board' && id) themes.add(id);
    }
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

/** Все предметы, которыми владеет профиль (база + инвентарь + достижения + премиум). */
export function ownedItems(profile: Profile | null): Set<string> {
  const out = new Set<string>();
  for (const i of ALL_ITEMS) if (i.source === 'base') out.add(itemKey(i));
  if (profile) {
    for (const k of Object.keys(profile.items ?? {})) out.add(k);
    for (const a of LIFETIME) if (profile.unlocked[a.id] && a.unlocks) out.add(`${a.unlocks.kind === 'theme' ? 'board' : a.unlocks.kind}:${a.unlocks.id}`);
  }
  if (isPremium()) for (const i of ALL_ITEMS) out.add(itemKey(i));
  return out;
}

export interface ChestResult {
  item: Item;
  duplicate: boolean;
  xp: number;
}
/** Открыть один сундук профиля. */
export function openChest(profile: Profile, random: () => number = Math.random): ChestResult | null {
  if (profile.chests <= 0) return null;
  profile.chests -= 1;
  profile.totals.chestsOpened += 1;
  const r = rollChest(ownedItems(profile), random);
  const key = itemKey(r.item);
  profile.items[key] = (profile.items[key] ?? 0) + 1;
  if (r.duplicate) profile.xp += r.xp;
  profile.updatedAt = Date.now();
  return r;
}

// ---------- ежедневная серия ----------
export const STREAK_REWARDS: { day: number; xp: number; chest: boolean; label: string }[] = [
  { day: 1, xp: 10, chest: false, label: '+10 опыта' },
  { day: 2, xp: 15, chest: false, label: '+15 опыта' },
  { day: 3, xp: 20, chest: true, label: '+20 опыта и сундук' },
  { day: 4, xp: 25, chest: false, label: '+25 опыта' },
  { day: 5, xp: 30, chest: true, label: '+30 опыта и сундук' },
  { day: 6, xp: 40, chest: false, label: '+40 опыта' },
  { day: 7, xp: 60, chest: true, label: '+60 опыта и большой сундук (×2)' },
];
function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Проверить серию на сегодня; вернуть награду, если её ещё не забирали. */
export function dailyStatus(profile: Profile): { count: number; claimable: boolean; reward: (typeof STREAK_REWARDS)[number] } {
  const t = today();
  let count = profile.streak.count;
  let claimable = false;
  if (profile.streak.last === t) claimable = !profile.streak.claimedToday;
  else {
    count = profile.streak.last === yesterday() ? count + 1 : 1;
    claimable = true;
  }
  const idx = ((Math.max(count, 1) - 1) % 7);
  return { count, claimable, reward: STREAK_REWARDS[idx]! };
}
export function claimDaily(profile: Profile): { count: number; reward: (typeof STREAK_REWARDS)[number] } | null {
  const st = dailyStatus(profile);
  if (!st.claimable) return null;
  profile.streak = { last: today(), count: st.count, claimedToday: true };
  profile.xp += st.reward.xp;
  if (st.reward.chest) profile.chests += st.reward.day === 7 ? 2 : 1;
  profile.totals.loginDays += 1;
  profile.updatedAt = Date.now();
  return { count: st.count, reward: st.reward };
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
  corner?: Corner;
  penaltyByCell?: Record<string, number>;
  turns?: number;
  challenge?: Challenge | null;
}

export interface ProfileDelta {
  name: string;
  xpGained: number;
  levelBefore: number;
  levelAfter: number;
  newLifetime: LifetimeAchievement[];
  questsDone: Quest[];
  chestsGained: number;
  challengeXp: number;
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
  if (o.won && o.corner) t.winsByCorner[o.corner] = (t.winsByCorner[o.corner] ?? 0) + 1;
  for (const [cell, n] of Object.entries(o.penaltyByCell ?? {})) t.penaltyByCell[cell] = (t.penaltyByCell[cell] ?? 0) + n;
  t.turnsTotal += o.turns ?? 0;
  let chestsGained = 0;
  if (o.won) {
    p.chests += 1;
    chestsGained += 1;
  }
  const challengeXp = o.challenge ? o.challenge.bonusXp(o.stats, o.won) : 0;

  let xp = challengeXp + XP.game + (o.won ? XP.win : 0) + o.stats.captures * XP.capture + o.stats.lapsCompleted * XP.lap + o.stats.piecesFinished * XP.finished + o.inGameAchievements * XP.achievement;

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
      p.chests += 1;
      chestsGained += 1;
    }
  }

  p.xp += xp;
  p.avatar = o.avatar;
  p.updatedAt = Date.now();
  return { name: p.name, xpGained: xp, levelBefore: before, levelAfter: levelFromXp(p.xp).level, newLifetime, questsDone, chestsGained, challengeXp };
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
