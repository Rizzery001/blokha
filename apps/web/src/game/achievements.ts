import type { GameState, PlayerStats } from '@blokha/game-engine';

/** Достижения выдаются в момент, когда статистика впервые пересекает порог. */
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const RULES: { id: string; icon: string; title: string; description: string; test: (s: PlayerStats, prev: PlayerStats) => boolean }[] = [
  { id: 'first-blood', icon: '🎯', title: 'Первая кровь', description: 'Первое выбитие в партии', test: (s, p) => s.captures >= 1 && p.captures < 1 },
  { id: 'hunter', icon: '🏹', title: 'Охотник', description: 'Три выбитые фигуры', test: (s, p) => s.captures >= 3 && p.captures < 3 },
  { id: 'terminator', icon: '💀', title: 'Терминатор', description: 'Шесть выбитых фигур', test: (s, p) => s.captures >= 6 && p.captures < 6 },
  { id: 'double-six', icon: '🎲', title: 'Дубль', description: 'Две шестёрки подряд', test: (s, p) => s.sixStreak >= 2 && p.sixStreak < 2 },
  { id: 'triple-six', icon: '🔥', title: 'Горячая рука', description: 'Три шестёрки подряд', test: (s, p) => s.sixStreak >= 3 && p.sixStreak < 3 },
  { id: 'lap', icon: '🔄', title: 'Полный круг', description: 'Фигура обошла всю доску', test: (s, p) => s.lapsCompleted >= 1 && p.lapsCompleted < 1 },
  { id: 'home', icon: '🏠', title: 'Дома', description: 'Первая фигура на крайней клетке финиша', test: (s, p) => s.piecesFinished >= 1 && p.piecesFinished < 1 },
  { id: 'lucky', icon: '🍀', title: 'Везунчик', description: 'Три бонусные клетки за партию', test: (s, p) => s.bonusCells >= 3 && p.bonusCells < 3 },
  { id: 'unlucky', icon: '🌧️', title: 'Не везёт', description: 'Три штрафные клетки за партию', test: (s, p) => s.penaltyCells >= 3 && p.penaltyCells < 3 },
  { id: 'survivor', icon: '🛡️', title: 'Живучий', description: 'Выбит трижды, но не сдаётся', test: (s, p) => s.captured >= 3 && p.captured < 3 },
  { id: 'army', icon: '♟️', title: 'Вся армия', description: 'Все четыре фигуры выведены на поле', test: (s, p) => s.spawned >= 4 && p.spawned < 4 },
];

export function newAchievements(prev: GameState | null, next: GameState): { playerId: string; achievement: Achievement }[] {
  const out: { playerId: string; achievement: Achievement }[] = [];
  for (const player of next.players) {
    const s = next.stats?.[player.id];
    if (!s) continue;
    const p = prev?.stats?.[player.id] ?? ({ ...s, captures: 0, sixStreak: 0, lapsCompleted: 0, piecesFinished: 0, bonusCells: 0, penaltyCells: 0, captured: 0, spawned: 0 } as PlayerStats);
    for (const r of RULES) {
      if (r.test(s, p)) out.push({ playerId: player.id, achievement: { id: r.id, title: r.title, description: r.description, icon: r.icon } });
    }
  }
  return out;
}

/** Награды по итогам партии: по одной номинации каждому, кому есть что вручить. */
export interface Award {
  playerId: string;
  icon: string;
  title: string;
  value: string;
}

export function finalAwards(state: GameState): Award[] {
  const awards: Award[] = [];
  const entries = state.players.map((p) => ({ id: p.id, s: state.stats?.[p.id] })).filter((e): e is { id: string; s: PlayerStats } => !!e.s);
  if (entries.length === 0) return awards;
  const top = (key: keyof PlayerStats) => entries.reduce((a, b) => (b.s[key] > a.s[key] ? b : a));
  const pick = (key: keyof PlayerStats, icon: string, title: string, fmt: (v: number) => string) => {
    const t = top(key);
    if (t.s[key] > 0) awards.push({ playerId: t.id, icon, title, value: fmt(t.s[key]) });
  };
  pick('captures', '🏹', 'Охотник партии', (v) => `${v} выбит.`);
  pick('sixes', '🎲', 'Король шестёрок', (v) => `${v} шестёрок`);
  pick('bonusCells', '🍀', 'Везунчик', (v) => `${v} бонус.`);
  pick('penaltyCells', '🌧️', 'Невезучий', (v) => `${v} штраф.`);
  pick('captured', '🛡️', 'Живучий', (v) => `выбит ${v} раз`);
  pick('stepsMoved', '🚶', 'Марафонец', (v) => `${v} клеток`);
  return awards;
}
