/** Испытания партии: меняют только награду (опыт), не правила. Одно на партию, одинаковое для всех игроков. */
import type { PlayerStats } from '@blokha/game-engine';

export interface Challenge {
  id: string;
  icon: string;
  title: string;
  description: string;
  /** дополнительный опыт по итогам партии */
  bonusXp: (s: PlayerStats, won: boolean) => number;
}

export const CHALLENGES: Challenge[] = [
  { id: 'hunt', icon: '🏹', title: 'Охота', description: 'Опыт за выбивания ×2', bonusXp: (s) => s.captures * 5 },
  { id: 'peace', icon: '🕊️', title: 'Тихая партия', description: '+50 опыта, если за партию никого не выбить', bonusXp: (s) => (s.captures === 0 ? 50 : 0) },
  { id: 'bonus', icon: '🍀', title: 'Везунчик', description: '+15 опыта за каждую бонусную клетку', bonusXp: (s) => s.bonusCells * 15 },
  { id: 'marathon', icon: '🚶', title: 'Марафон', description: '+1 опыт за каждую пройденную клетку', bonusXp: (s) => s.stepsMoved },
  { id: 'sixes', icon: '🎲', title: 'Шестёрочник', description: '+6 опыта за каждую шестёрку', bonusXp: (s) => s.sixes * 6 },
  { id: 'survivor', icon: '🛡️', title: 'Выживший', description: '+40 опыта, если тебя выбили не больше одного раза', bonusXp: (s) => (s.captured <= 1 ? 40 : 0) },
  { id: 'closer', icon: '🏁', title: 'Финишёр', description: '+20 опыта за каждую фигуру на крайней клетке финиша', bonusXp: (s) => s.piecesFinished * 20 },
  { id: 'winner', icon: '👑', title: 'Всё или ничего', description: 'Победитель получает +100 опыта, остальные 0', bonusXp: (_s, won) => (won ? 100 : 0) },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Выбор испытания детерминированно по ключу партии (одинаково у всех клиентов комнаты). */
export function pickChallenge(seed: string): Challenge {
  return CHALLENGES[hash(seed) % CHALLENGES.length]!;
}
