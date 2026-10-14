import { CORNERS, DEFAULT_BOARD_CONFIG, getCellForProgress, lapLength } from './board';
import {
  buildOccupancy,
  checkVictory,
  currentPlayer,
  evaluateAutoMove,
  getLegalActions,
  getPlayer,
  refreshPieceStatus,
} from './rules';
import {
  EngineError,
  type BoardConfig,
  type Cell,
  type CommandResult,
  type Corner,
  type GameCommand,
  type GameEvent,
  type GameState,
  type LegalAction,
  type PlayerState,
  type PlayerStats,
} from './types';

export function emptyStats(): PlayerStats {
  return {
    rolls: 0, sixes: 0, sixStreak: 0, bestSixStreak: 0, captures: 0, captured: 0, bonusCells: 0, penaltyCells: 0,
    autoForward: 0, autoBackward: 0, burnedRolls: 0, skippedTurns: 0, spawned: 0, lapsCompleted: 0, piecesFinished: 0, stepsMoved: 0,
  };
}

export interface PlayerSetup {
  id: string;
  nickname: string;
  corner: Corner;
  pieceSet?: string;
  color?: string;
  avatar?: string;
}

export interface CreateGameOptions {
  players: PlayerSetup[];
  config?: BoardConfig;
}

const DEFAULT_COLORS = ['#d9480f', '#1971c2', '#2b8a3e', '#862e9c'];
const DEFAULT_SETS = ['pawn', 'knight', 'rook', 'bishop'];
const DEFAULT_AVATARS = ['🦊', '🐻', '🐼', '🦁'];

export function createGame(options: CreateGameOptions): CommandResult {
  const config = options.config ?? DEFAULT_BOARD_CONFIG;
  const { players } = options;
  if (players.length < config.playerCount.min || players.length > config.playerCount.max) {
    throw new EngineError('invalidSetup', `Нужно от ${config.playerCount.min} до ${config.playerCount.max} игроков`);
  }
  const ids = new Set<string>();
  const corners = new Set<Corner>();
  for (const p of players) {
    if (ids.has(p.id)) throw new EngineError('invalidSetup', `Дублируется id игрока ${p.id}`);
    if (!CORNERS.includes(p.corner)) throw new EngineError('invalidSetup', `Неизвестный угол ${p.corner}`);
    if (corners.has(p.corner)) throw new EngineError('invalidSetup', `Угол ${p.corner} уже занят`);
    ids.add(p.id);
    corners.add(p.corner);
  }

  const playerStates: PlayerState[] = players.map((p, i) => ({
    id: p.id,
    nickname: p.nickname,
    corner: p.corner,
    pieceSet: p.pieceSet ?? DEFAULT_SETS[i % DEFAULT_SETS.length]!,
    color: p.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]!,
    avatar: p.avatar ?? DEFAULT_AVATARS[i % DEFAULT_AVATARS.length]!,
    bonusRollsRemaining: 0,
    skippedTurnsRemaining: 0,
    pieces: Array.from({ length: config.pieceCountPerPlayer }, (_, k) => ({
      id: `${p.id}-${k + 1}`,
      ownerId: p.id,
      status: 'reserve' as const,
      progress: null,
      appearance: p.pieceSet ?? DEFAULT_SETS[i % DEFAULT_SETS.length]!,
    })),
  }));

  const state: GameState = {
    config,
    stats: Object.fromEntries(players.map((p) => [p.id, emptyStats()])),
    players: playerStates,
    turnOrder: players.map((p) => p.id),
    currentPlayerIndex: 0,
    phase: 'awaitingRoll',
    currentRoll: null,
    freeRollAvailable: true,
    legalActions: [],
    blockedPieces: [],
    winnerId: null,
    version: 0,
    turnNumber: 1,
  };
  const events: GameEvent[] = [{ type: 'gameStarted', playerIds: state.turnOrder }];
  events.push({ type: 'turnStarted', playerId: state.turnOrder[0]!, turnNumber: 1 });
  return { state, events };
}

export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

/**
 * Единственная точка входа для изменения состояния. Возвращает новое состояние и список событий.
 * Исходное состояние не изменяется.
 */
export function applyCommand(prev: GameState, command: GameCommand): CommandResult {
  if (prev.phase === 'finished') throw new EngineError('gameFinished', 'Партия завершена');
  const state = cloneState(prev);
  const events: GameEvent[] = [];
  const player = currentPlayer(state);
  if (command.playerId !== player.id) {
    throw new EngineError('notYourTurn', `Сейчас ходит ${player.nickname}`);
  }
  switch (command.type) {
    case 'roll':
      resolveDiceRoll(state, events, command.value);
      break;
    case 'chooseAction':
      resolveAction(state, events, command.actionId);
      break;
    default:
      throw new EngineError('unknownAction', 'Неизвестная команда');
  }
  state.version = prev.version + 1;
  return { state, events };
}

/** Бросок кубика: списывает бесплатный/бонусный бросок, начисляет +1 за шестёрку, считает легальные действия. */
export function resolveDiceRoll(state: GameState, events: GameEvent[], value: number): void {
  if (state.phase !== 'awaitingRoll') throw new EngineError('wrongPhase', 'Сейчас нельзя бросать кубик');
  if (!Number.isInteger(value) || value < 1 || value > state.config.diceSides) {
    throw new EngineError('invalidRoll', `Недопустимое значение кубика: ${value}`);
  }
  const player = currentPlayer(state);
  let isBonusRoll = false;
  if (state.freeRollAvailable) {
    state.freeRollAvailable = false;
  } else if (player.bonusRollsRemaining > 0) {
    player.bonusRollsRemaining -= 1;
    isBonusRoll = true;
  } else {
    throw new EngineError('wrongPhase', 'У игрока нет доступных бросков');
  }

  const sixBonusGranted = value === state.config.rules.spawnDieValue && state.config.rules.extraRollForEverySix > 0;
  if (sixBonusGranted) player.bonusRollsRemaining += state.config.rules.extraRollForEverySix;
  const st = statsOf(state, player.id);
  st.rolls += 1;
  if (value === state.config.rules.spawnDieValue) {
    st.sixes += 1;
    st.sixStreak += 1;
    st.bestSixStreak = Math.max(st.bestSixStreak, st.sixStreak);
  } else st.sixStreak = 0;

  events.push({
    type: 'rolled',
    playerId: player.id,
    value,
    isBonusRoll,
    bonusRollsRemaining: player.bonusRollsRemaining,
    sixBonusGranted,
  });

  const { actions, blocked } = getLegalActions(state, player.id, value);
  state.currentRoll = value;
  state.blockedPieces = blocked;
  if (actions.length === 0) {
    st.burnedRolls += 1;
    events.push({
      type: 'rollBurned',
      playerId: player.id,
      value,
      bonusRollsRemaining: player.bonusRollsRemaining,
      blockedPieces: blocked,
    });
    state.legalActions = [];
    state.currentRoll = null;
    finishRoll(state, events);
    return;
  }
  state.legalActions = actions;
  state.phase = 'awaitingAction';
}

function resolveAction(state: GameState, events: GameEvent[], actionId: string): void {
  if (state.phase !== 'awaitingAction') throw new EngineError('wrongPhase', 'Сначала нужно бросить кубик');
  const action = state.legalActions.find((a) => a.id === actionId);
  if (!action) throw new EngineError('unknownAction', `Недопустимое действие ${actionId}`);
  const player = currentPlayer(state);
  applyPieceMove(state, events, player, action);
  state.legalActions = [];
  state.blockedPieces = [];
  state.currentRoll = null;
  finishRoll(state, events);
}

function capturePiece(state: GameState, events: GameEvent[], victimPlayerId: string, victimPieceId: string, by: { playerId: string; pieceId: string }, cell: Cell): void {
  const victimPlayer = getPlayer(state, victimPlayerId);
  const victim = victimPlayer.pieces.find((p) => p.id === victimPieceId);
  if (!victim) throw new Error(`Victim piece ${victimPieceId} not found`);
  victim.progress = null;
  refreshPieceStatus(state.config, victimPlayer, victim);
  statsOf(state, victimPlayerId).captured += 1;
  statsOf(state, by.playerId).captures += 1;
  events.push({
    type: 'captured',
    victimPieceId,
    victimPlayerId,
    byPieceId: by.pieceId,
    byPlayerId: by.playerId,
    cell,
  });
}

/** Применяет выбранное действие (выход из резерва или ход) и эффект клетки. */
export function applyPieceMove(state: GameState, events: GameEvent[], player: PlayerState, action: LegalAction): void {
  const piece = player.pieces.find((p) => p.id === action.pieceId);
  if (!piece) throw new Error(`Piece ${action.pieceId} not found`);
  if (action.captures) {
    capturePiece(state, events, action.captures.playerId, action.captures.pieceId, { playerId: player.id, pieceId: piece.id }, action.to);
  }
  if (action.type === 'spawn') {
    piece.progress = 0;
    refreshPieceStatus(state.config, player, piece);
    statsOf(state, player.id).spawned += 1;
    events.push({ type: 'spawned', playerId: player.id, pieceId: piece.id, cell: action.to });
    // Спецклетки активируются только при обычном перемещении; угол не является спецклеткой.
    return;
  }
  piece.progress = action.toProgress;
  refreshPieceStatus(state.config, player, piece);
  {
    const st = statsOf(state, player.id);
    st.stepsMoved += action.path.length;
    const lap = lapLength(state.config);
    if (action.fromProgress < lap && action.toProgress >= lap) st.lapsCompleted += 1;
    if (action.toProgress === maxProgressFor(state, player)) st.piecesFinished += 1;
  }
  events.push({ type: 'moved', playerId: player.id, pieceId: piece.id, from: action.from, to: action.to, path: action.path, kind: 'normal' });
  resolveSpecialCell(state, events, player, piece.id, action.to);
}

/** Эффект спецклетки при попадании на неё как на конечную клетку обычного хода. Цепочек нет. */
export function resolveSpecialCell(state: GameState, events: GameEvent[], player: PlayerState, pieceId: string, cell: Cell): void {
  const special = state.config.specialCells[cell];
  if (!special) return;
  const piece = player.pieces.find((p) => p.id === pieceId)!;
  if (special.type === 'turnBalance') {
    applyTurnBalance(player, special.rolls);
    if (special.rolls > 0) statsOf(state, player.id).bonusCells += 1;
    else statsOf(state, player.id).penaltyCells += 1;
    events.push({
      type: 'turnBalance',
      playerId: player.id,
      cell,
      rolls: special.rolls,
      bonusRollsRemaining: player.bonusRollsRemaining,
      skippedTurnsRemaining: player.skippedTurnsRemaining,
    });
    return;
  }
  if (special.type === 'autoMove') {
    const occupancy = buildOccupancy(state);
    const ev = evaluateAutoMove(state, occupancy, player, piece, special.steps, special.captureOnDestination);
    if (!ev.ok) {
      events.push({ type: 'autoMoveCancelled', playerId: player.id, pieceId, cell, steps: special.steps, reason: ev.reason });
      return;
    }
    if (ev.captures) {
      capturePiece(state, events, ev.captures.playerId, ev.captures.pieceId, { playerId: player.id, pieceId }, ev.to);
    }
    piece.progress = ev.toProgress;
    refreshPieceStatus(state.config, player, piece);
    if (special.steps > 0) statsOf(state, player.id).autoForward += 1;
    else statsOf(state, player.id).autoBackward += 1;
    events.push({
      type: 'moved',
      playerId: player.id,
      pieceId,
      from: cell,
      to: ev.to,
      path: ev.path,
      kind: special.steps > 0 ? 'autoForward' : 'autoBackward',
    });
  }
}

/**
 * Взаимозачёт: положительная величина добавляет бонусные броски;
 * отрицательная сначала гасит неиспользованные бонусные броски, остаток становится пропусками очередей.
 */
export function applyTurnBalance(player: PlayerState, rolls: number): void {
  if (rolls >= 0) {
    player.bonusRollsRemaining += rolls;
    return;
  }
  let penalty = -rolls;
  const offset = Math.min(penalty, player.bonusRollsRemaining);
  player.bonusRollsRemaining -= offset;
  penalty -= offset;
  player.skippedTurnsRemaining += penalty;
}

/** После обработки броска: победа → финиш; есть бонусные броски → продолжаем; иначе передаём очередь. */
function finishRoll(state: GameState, events: GameEvent[]): void {
  const player = currentPlayer(state);
  if (checkVictory(state, player.id)) {
    state.phase = 'finished';
    state.winnerId = player.id;
    events.push({ type: 'gameFinished', winnerId: player.id });
    return;
  }
  if (player.bonusRollsRemaining > 0) {
    state.phase = 'awaitingRoll';
    return;
  }
  advanceTurn(state, events);
}

/** Передача очереди следующему игроку с учётом пропусков. */
export function advanceTurn(state: GameState, events: GameEvent[]): void {
  const n = state.turnOrder.length;
  // Защита от бесконечного цикла: суммарное число пропусков конечно и убывает на каждой итерации.
  for (let guard = 0; guard < n * 1000; guard++) {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % n;
    state.turnNumber += 1;
    const next = currentPlayer(state);
    if (next.skippedTurnsRemaining > 0) {
      next.skippedTurnsRemaining -= 1;
      statsOf(state, next.id).skippedTurns += 1;
      events.push({ type: 'turnSkipped', playerId: next.id, remainingSkips: next.skippedTurnsRemaining });
      continue;
    }
    state.phase = 'awaitingRoll';
    state.freeRollAvailable = true;
    state.currentRoll = null;
    state.legalActions = [];
    state.blockedPieces = [];
    events.push({ type: 'turnStarted', playerId: next.id, turnNumber: state.turnNumber });
    return;
  }
  throw new Error('advanceTurn: unable to find next player');
}

function statsOf(state: GameState, playerId: string): PlayerStats {
  if (!state.stats) state.stats = {};
  return (state.stats[playerId] ??= emptyStats());
}

function maxProgressFor(state: GameState, player: PlayerState): number {
  return lapLength(state.config) + state.config.homes[player.corner]!.length - 1;
}

/** Удобный помощник для UI: клетка каждой фигуры на доске. */
export function pieceCell(state: GameState, playerId: string, pieceId: string): Cell | null {
  const player = getPlayer(state, playerId);
  const piece = player.pieces.find((p) => p.id === pieceId);
  if (!piece || piece.progress === null) return null;
  return getCellForProgress(state.config, player.corner, piece.progress);
}

export { lapLength };
