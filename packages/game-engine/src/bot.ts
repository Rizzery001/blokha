import { getCellForProgress, lapLength, maxProgress } from './board';
import { buildOccupancy, getPlayer } from './rules';
import type { GameState, LegalAction } from './types';

/**
 * Эвристический робот. Правила не меняет: выбирает одно из легальных действий, рассчитанных движком.
 * Оценка: выбивание соперника, вход на финиш, бонусные клетки, безопасность после хода,
 * штраф за клетки пропуска и «5 назад», вывод фигур из резерва.
 */
export function scoreAction(state: GameState, playerId: string, action: LegalAction, random: () => number = Math.random): number {
  const player = getPlayer(state, playerId);
  const { config } = state;
  const lap = lapLength(config);
  let score = random() * 0.5; // лёгкая случайность, чтобы роботы не были одинаковыми

  if (action.captures) {
    const victim = getPlayer(state, action.captures.playerId);
    const vp = victim.pieces.find((p) => p.id === action.captures!.pieceId)!;
    // чем дальше прошла чужая фигура, тем ценнее её выбить
    score += 6 + ((vp.progress ?? 0) / lap) * 6;
  }

  if (action.type === 'spawn') {
    const onBoard = player.pieces.filter((p) => p.progress !== null && p.progress < lap).length;
    score += onBoard === 0 ? 8 : 4 - onBoard;
    return score;
  }

  const to = action.toProgress;
  const special = config.specialCells[action.to];
  if (special) {
    if (special.type === 'turnBalance') score += special.rolls * 2.5;
    else score += special.steps > 0 ? special.steps : special.steps * 1.2;
  }
  // продвижение и финиш
  score += (to - action.fromProgress) * 0.3;
  if (to === maxProgress(config, player.corner)) score += 7;
  else if (to > lap) score += 4;
  else if (to === lap) score += 2;

  // безопасность: сколько чужих фигур стоят на 1..6 клеток позади конечной клетки (на периметре)
  if (to <= lap) {
    const occupancy = buildOccupancy(state);
    let threats = 0;
    for (let back = 1; back <= config.diceSides; back++) {
      const cell = getCellForProgress(config, player.corner, to - back);
      const occ = occupancy.get(cell);
      if (occ && occ.player.id !== playerId && occ.piece.progress !== null && occ.piece.progress <= lap) threats += 1;
    }
    score -= threats * 2;
    // уходим из-под угрозы
    let threatsNow = 0;
    for (let back = 1; back <= config.diceSides; back++) {
      const cell = getCellForProgress(config, player.corner, action.fromProgress - back);
      const occ = occupancy.get(cell);
      if (occ && occ.player.id !== playerId && occ.piece.progress !== null && occ.piece.progress <= lap) threatsNow += 1;
    }
    score += threatsNow * 1.5;
    // не стоять на своём углу, перекрывая выход из резерва
    if (to === 0) score -= 1;
  }
  return score;
}

export type BotLevel = 'easy' | 'normal' | 'hard';

/**
 * «Сильный» уровень: к эвристике добавляется оценка позиции после хода —
 * сколько своих фигур под ударом (чужая фигура в 1..6 клетках позади) и сколько чужих под нашим ударом.
 */
function positionScore(state: GameState, playerId: string, action: LegalAction): number {
  const { config } = state;
  const lap = lapLength(config);
  const player = getPlayer(state, playerId);
  const occupancy = buildOccupancy(state);
  // виртуально переставляем фигуру
  const mine = new Map<string, number>();
  for (const p of player.pieces) if (p.progress !== null) mine.set(p.id, p.progress);
  if (action.type === 'spawn') mine.set(action.pieceId, 0);
  else mine.set(action.pieceId, action.toProgress);
  const capturedId = action.captures?.pieceId ?? null;
  let score = 0;
  for (const [, prog] of mine) {
    if (prog > lap) continue;
    const cell = getCellForProgress(config, player.corner, prog);
    for (let back = 1; back <= config.diceSides; back++) {
      const behind = getCellForProgress(config, player.corner, prog - back);
      const occ = occupancy.get(behind);
      if (occ && occ.player.id !== playerId && occ.piece.id !== capturedId && occ.piece.progress !== null && occ.piece.progress <= lap) {
        // чем дальше наша фигура продвинулась, тем дороже её потерять
        score -= (1 + prog / lap) * 1.6;
      }
    }
    // чужие фигуры впереди в 1..6: потенциальная добыча на следующем броске
    for (let fwd = 1; fwd <= config.diceSides; fwd++) {
      if (prog + fwd > lap) break;
      const ahead = getCellForProgress(config, player.corner, prog + fwd);
      const occ = occupancy.get(ahead);
      if (occ && occ.player.id !== playerId && occ.piece.id !== capturedId) score += 0.6;
    }
    void cell;
  }
  return score;
}

export function chooseBotAction(state: GameState, playerId: string, random: () => number = Math.random, level: BotLevel = 'normal'): LegalAction {
  const actions = state.legalActions;
  if (actions.length === 0) throw new Error('Нет легальных действий');
  if (level === 'easy') {
    // простой: выбивает, если может, иначе случайный ход
    const cap = actions.filter((a) => a.captures);
    const pool = cap.length > 0 && random() < 0.7 ? cap : actions;
    return pool[Math.floor(random() * pool.length)]!;
  }
  let best = actions[0]!;
  let bestScore = -Infinity;
  for (const a of actions) {
    let s = scoreAction(state, playerId, a, random);
    if (level === 'hard') s += positionScore(state, playerId, a);
    if (s > bestScore) {
      bestScore = s;
      best = a;
    }
  }
  return best;
}
