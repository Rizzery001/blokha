/**
 * Базовые типы игрового движка BLOKHA.
 * Движок чистый: без React, без сокетов, без случайности (значение кубика передаётся снаружи).
 */

export type FileLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type RankNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type Cell = `${FileLetter}${RankNumber}`;
export type Corner = 'A1' | 'H1' | 'H8' | 'A8';

export type PieceStatus = 'reserve' | 'perimeter' | 'finish' | 'locked';

export interface Piece {
  id: string;
  ownerId: string;
  status: PieceStatus;
  /** null — в резерве; иначе прогресс по маршруту (см. docs: 0 = старт, 28 = угол после круга, 29..31 = диагональ). */
  progress: number | null;
  /** косметика: идентификатор формы фигуры */
  appearance: string;
}

export interface PlayerState {
  id: string;
  nickname: string;
  corner: Corner;
  pieces: Piece[];
  bonusRollsRemaining: number;
  skippedTurnsRemaining: number;
  /** косметика: набор фигур, цвет, аватар (эмодзи) */
  pieceSet: string;
  color: string;
  avatar: string;
}

export type SpecialCellConfig =
  | {
      type: 'autoMove';
      steps: number;
      captureOnDestination: boolean;
      intermediateCellsMustBeEmpty: boolean;
    }
  | { type: 'turnBalance'; rolls: number };

export interface BoardRules {
  spawnDieValue: number;
  extraRollForEverySix: number;
  multipleSixesAllowed: boolean;
  singleOccupancy: boolean;
  intermediateCellsBlockAllMoves: boolean;
  normalMoveCapturesOnDestination: boolean;
  spawnCapturesOpponent: boolean;
  backwardsAutoMoveCaptures: boolean;
  specialCellsTriggerOnlyOnNormalMoveLanding: boolean;
  specialCellsTriggerWhenPassedThrough: boolean;
  exactFinishRollRequired: boolean;
  cornerFinishSquareIsCapturable: boolean;
  blockedRollIsSpent: boolean;
  penaltiesOffsetUnusedBonusRolls: boolean;
}

export interface BoardConfig {
  gameId: string;
  version: string;
  boardSize: number;
  diceSides: number;
  pieceCountPerPlayer: number;
  playerCount: { min: number; max: number };
  direction: 'clockwise';
  perimeter: Cell[];
  homes: Record<Corner, Cell[]>;
  specialCells: Record<string, SpecialCellConfig>;
  rules: BoardRules;
}

export type GamePhase = 'awaitingRoll' | 'awaitingAction' | 'finished';

export interface CaptureInfo {
  pieceId: string;
  playerId: string;
}

export type LegalAction =
  | {
      id: string;
      type: 'spawn';
      pieceId: string;
      to: Cell;
      captures: CaptureInfo | null;
    }
  | {
      id: string;
      type: 'move';
      pieceId: string;
      from: Cell;
      to: Cell;
      /** клетки, которые фигура проходит, включая конечную */
      path: Cell[];
      fromProgress: number;
      toProgress: number;
      captures: CaptureInfo | null;
    };

/** Почему конкретная фигура не может сходить на текущий бросок (для подсказок в UI). */
export interface BlockedPieceReason {
  pieceId: string;
  reason:
    | 'inReserveNeedsSix'
    | 'locked'
    | 'overshootsFinish'
    | 'pathBlocked'
    | 'destinationOwnPiece'
    | 'cornerOccupiedByOwnPiece';
  cell?: Cell;
}

/** Статистика игрока за партию (для таблицы результатов и достижений). Ведётся движком детерминированно. */
export interface PlayerStats {
  rolls: number;
  sixes: number;
  /** текущая серия шестёрок подряд и лучшая серия */
  sixStreak: number;
  bestSixStreak: number;
  captures: number;
  captured: number;
  bonusCells: number;
  penaltyCells: number;
  autoForward: number;
  autoBackward: number;
  burnedRolls: number;
  skippedTurns: number;
  spawned: number;
  lapsCompleted: number;
  piecesFinished: number;
  stepsMoved: number;
}

export interface GameState {
  config: BoardConfig;
  stats: Record<string, PlayerStats>;
  players: PlayerState[];
  /** порядок ходов — по порядку в лобби */
  turnOrder: string[];
  currentPlayerIndex: number;
  phase: GamePhase;
  /** значение текущего броска, пока ждём выбора фигуры */
  currentRoll: number | null;
  /** доступен ли «бесплатный» бросок начала очереди */
  freeRollAvailable: boolean;
  legalActions: LegalAction[];
  blockedPieces: BlockedPieceReason[];
  winnerId: string | null;
  /** монотонная версия состояния; каждая команда увеличивает её на 1 */
  version: number;
  turnNumber: number;
}

export type GameCommand =
  | { type: 'roll'; playerId: string; value: number }
  | { type: 'chooseAction'; playerId: string; actionId: string };

export type MoveKind = 'normal' | 'autoForward' | 'autoBackward';

export type GameEvent =
  | { type: 'gameStarted'; playerIds: string[] }
  | { type: 'turnStarted'; playerId: string; turnNumber: number }
  | { type: 'turnSkipped'; playerId: string; remainingSkips: number }
  | {
      type: 'rolled';
      playerId: string;
      value: number;
      isBonusRoll: boolean;
      bonusRollsRemaining: number;
      sixBonusGranted: boolean;
    }
  | {
      type: 'rollBurned';
      playerId: string;
      value: number;
      bonusRollsRemaining: number;
      blockedPieces: BlockedPieceReason[];
    }
  | { type: 'spawned'; playerId: string; pieceId: string; cell: Cell }
  | {
      type: 'moved';
      playerId: string;
      pieceId: string;
      from: Cell;
      to: Cell;
      path: Cell[];
      kind: MoveKind;
    }
  | {
      type: 'captured';
      victimPieceId: string;
      victimPlayerId: string;
      byPieceId: string;
      byPlayerId: string;
      cell: Cell;
    }
  | {
      type: 'autoMoveCancelled';
      playerId: string;
      pieceId: string;
      cell: Cell;
      steps: number;
      reason: 'pathBlocked' | 'destinationOwnPiece' | 'destinationOccupied' | 'outOfRange';
    }
  | {
      type: 'turnBalance';
      playerId: string;
      cell: Cell;
      rolls: number;
      bonusRollsRemaining: number;
      skippedTurnsRemaining: number;
    }
  | { type: 'gameFinished'; winnerId: string };

export interface CommandResult {
  state: GameState;
  events: GameEvent[];
}

export class EngineError extends Error {
  constructor(
    public readonly code:
      | 'notYourTurn'
      | 'wrongPhase'
      | 'invalidRoll'
      | 'unknownAction'
      | 'gameFinished'
      | 'invalidSetup',
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}
