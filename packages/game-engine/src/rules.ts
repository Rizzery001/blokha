import {
  getCellForProgress,
  getPathForMove,
  lapLength,
  maxProgress,
  statusForProgress,
} from './board';
import type {
  BlockedPieceReason,
  BoardConfig,
  CaptureInfo,
  Cell,
  GameState,
  LegalAction,
  Piece,
  PlayerState,
} from './types';

export interface Occupant {
  piece: Piece;
  player: PlayerState;
}

/** Карта занятости клеток: на любой клетке не более одной фигуры (инвариант движка). */
export function buildOccupancy(state: GameState): Map<Cell, Occupant> {
  const map = new Map<Cell, Occupant>();
  for (const player of state.players) {
    for (const piece of player.pieces) {
      if (piece.progress === null) continue;
      const cell = getCellForProgress(state.config, player.corner, piece.progress);
      if (map.has(cell)) {
        throw new Error(`Invariant violated: two pieces on ${cell}`);
      }
      map.set(cell, { piece, player });
    }
  }
  return map;
}

export function occupantAt(state: GameState, cell: Cell): Occupant | undefined {
  return buildOccupancy(state).get(cell);
}

export function getPlayer(state: GameState, playerId: string): PlayerState {
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) throw new Error(`Unknown player ${playerId}`);
  return p;
}

export function currentPlayer(state: GameState): PlayerState {
  const id = state.turnOrder[state.currentPlayerIndex];
  if (!id) throw new Error('Invalid currentPlayerIndex');
  return getPlayer(state, id);
}

export type MoveEvaluation =
  | { ok: true; path: Cell[]; toProgress: number; to: Cell; captures: CaptureInfo | null }
  | { ok: false; reason: BlockedPieceReason['reason']; cell?: Cell };

/**
 * Проверка обычного хода фигуры на `steps` клеток вперёд.
 * Все промежуточные клетки должны быть свободны; конечная: пусто → ход, чужая → выбивание, своя → запрет.
 * Точное попадание в финиш обязательно: превышение максимального прогресса запрещено.
 */
export function evaluateNormalMove(
  state: GameState,
  occupancy: Map<Cell, Occupant>,
  player: PlayerState,
  piece: Piece,
  steps: number,
): MoveEvaluation {
  const { config } = state;
  if (piece.progress === null) return { ok: false, reason: 'inReserveNeedsSix' };
  if (piece.status === 'locked') return { ok: false, reason: 'locked' };
  const toProgress = piece.progress + steps;
  if (toProgress > maxProgress(config, player.corner)) return { ok: false, reason: 'overshootsFinish' };
  const path = getPathForMove(config, player.corner, piece.progress, steps);
  for (let i = 0; i < path.length - 1; i++) {
    const step = path[i]!;
    if (occupancy.has(step.cell)) return { ok: false, reason: 'pathBlocked', cell: step.cell };
  }
  const last = path[path.length - 1]!;
  const occ = occupancy.get(last.cell);
  let captures: CaptureInfo | null = null;
  if (occ) {
    if (occ.player.id === player.id) return { ok: false, reason: 'destinationOwnPiece', cell: last.cell };
    if (!config.rules.normalMoveCapturesOnDestination) return { ok: false, reason: 'pathBlocked', cell: last.cell };
    captures = { pieceId: occ.piece.id, playerId: occ.player.id };
  }
  return { ok: true, path: path.map((s) => s.cell), toProgress, to: last.cell, captures };
}

export type SpawnEvaluation =
  | { ok: true; to: Cell; captures: CaptureInfo | null }
  | { ok: false; reason: 'cornerOccupiedByOwnPiece' | 'noPieceInReserve' };

export function evaluateSpawn(
  state: GameState,
  occupancy: Map<Cell, Occupant>,
  player: PlayerState,
): SpawnEvaluation {
  const corner = player.corner;
  const occ = occupancy.get(corner);
  if (occ) {
    if (occ.player.id === player.id) return { ok: false, reason: 'cornerOccupiedByOwnPiece' };
    if (!state.config.rules.spawnCapturesOpponent) return { ok: false, reason: 'cornerOccupiedByOwnPiece' };
    return { ok: true, to: corner, captures: { pieceId: occ.piece.id, playerId: occ.player.id } };
  }
  return { ok: true, to: corner, captures: null };
}

export interface LegalActionsResult {
  actions: LegalAction[];
  blocked: BlockedPieceReason[];
}

/** Все допустимые действия текущего игрока на данный бросок. */
export function getLegalActions(state: GameState, playerId: string, roll: number): LegalActionsResult {
  const player = getPlayer(state, playerId);
  const occupancy = buildOccupancy(state);
  const actions: LegalAction[] = [];
  const blocked: BlockedPieceReason[] = [];
  const isSix = roll === state.config.rules.spawnDieValue;

  const reservePieces = player.pieces.filter((p) => p.progress === null);
  if (reservePieces.length > 0) {
    if (isSix) {
      const spawn = evaluateSpawn(state, occupancy, player);
      const piece = reservePieces[0]!;
      if (spawn.ok) {
        actions.push({ id: `spawn:${piece.id}`, type: 'spawn', pieceId: piece.id, to: spawn.to, captures: spawn.captures });
      } else {
        for (const rp of reservePieces) blocked.push({ pieceId: rp.id, reason: 'cornerOccupiedByOwnPiece', cell: player.corner });
      }
    } else {
      for (const rp of reservePieces) blocked.push({ pieceId: rp.id, reason: 'inReserveNeedsSix' });
    }
  }

  for (const piece of player.pieces) {
    if (piece.progress === null) continue;
    const ev = evaluateNormalMove(state, occupancy, player, piece, roll);
    if (ev.ok) {
      actions.push({
        id: `move:${piece.id}`,
        type: 'move',
        pieceId: piece.id,
        from: getCellForProgress(state.config, player.corner, piece.progress),
        to: ev.to,
        path: ev.path,
        fromProgress: piece.progress,
        toProgress: ev.toProgress,
        captures: ev.captures,
      });
    } else {
      const b: BlockedPieceReason = { pieceId: piece.id, reason: ev.reason };
      if (ev.cell) b.cell = ev.cell;
      blocked.push(b);
    }
  }
  return { actions, blocked };
}

export type AutoMoveEvaluation =
  | { ok: true; path: Cell[]; toProgress: number; to: Cell; captures: CaptureInfo | null }
  | { ok: false; reason: 'pathBlocked' | 'destinationOwnPiece' | 'destinationOccupied' | 'outOfRange' };

/**
 * Автоперемещение с бонусной клетки. Вперёд: промежуточные пусты, конечная пуста или чужая (выбивание).
 * Назад: промежуточные и конечная пусты, выбивание запрещено.
 */
export function evaluateAutoMove(
  state: GameState,
  occupancy: Map<Cell, Occupant>,
  player: PlayerState,
  piece: Piece,
  steps: number,
  captureOnDestination: boolean,
): AutoMoveEvaluation {
  const { config } = state;
  if (piece.progress === null || steps === 0) return { ok: false, reason: 'outOfRange' };
  const toProgress = piece.progress + steps;
  if (toProgress > maxProgress(config, player.corner)) return { ok: false, reason: 'outOfRange' };
  // Назад дальше, чем на полный круг до старта, физически невозможно; ограничиваем диапазон.
  if (toProgress < -(lapLength(config) - 1)) return { ok: false, reason: 'outOfRange' };
  const path = getPathForMove(config, player.corner, piece.progress, steps);
  for (let i = 0; i < path.length - 1; i++) {
    if (occupancy.has(path[i]!.cell)) return { ok: false, reason: 'pathBlocked' };
  }
  const last = path[path.length - 1]!;
  const occ = occupancy.get(last.cell);
  let captures: CaptureInfo | null = null;
  if (occ) {
    if (occ.player.id === player.id) return { ok: false, reason: 'destinationOwnPiece' };
    if (!captureOnDestination) return { ok: false, reason: 'destinationOccupied' };
    captures = { pieceId: occ.piece.id, playerId: occ.player.id };
  }
  return { ok: true, path: path.map((s) => s.cell), toProgress, to: last.cell, captures };
}

/** Победа: все фигуры игрока одновременно стоят на четырёх клетках его финиша, каждая — пройдя полный круг. */
export function checkVictory(state: GameState, playerId: string): boolean {
  const player = getPlayer(state, playerId);
  const lap = lapLength(state.config);
  const home = state.config.homes[player.corner]!;
  if (player.pieces.length !== home.length) return false;
  const needed = new Set(home.map((_, i) => lap + i));
  for (const piece of player.pieces) {
    if (piece.progress === null || !needed.has(piece.progress)) return false;
    needed.delete(piece.progress);
  }
  return needed.size === 0;
}

export function refreshPieceStatus(config: BoardConfig, player: PlayerState, piece: Piece): void {
  piece.status = statusForProgress(config, player.corner, piece.progress);
}
