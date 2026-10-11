import {
  applyCommand,
  createGame,
  currentPlayer,
  getPlayer,
  refreshPieceStatus,
  type Corner,
  type GameEvent,
  type GameState,
  type LegalAction,
} from '../src';

export function newGame(corners: Corner[] = ['A1', 'H1']): GameState {
  return createGame({
    players: corners.map((c, i) => ({ id: `p${i + 1}`, nickname: `Player ${i + 1}`, corner: c })),
  }).state;
}

/** Прямая расстановка для тестов: ставит фигуру игрока на прогресс (null = резерв). */
export function place(state: GameState, playerId: string, pieceIndex: number, progress: number | null): GameState {
  const s = structuredClone(state);
  const player = getPlayer(s, playerId);
  const piece = player.pieces[pieceIndex]!;
  piece.progress = progress;
  refreshPieceStatus(s.config, player, piece);
  return s;
}

export function setTurn(state: GameState, playerId: string): GameState {
  const s = structuredClone(state);
  s.currentPlayerIndex = s.turnOrder.indexOf(playerId);
  s.phase = 'awaitingRoll';
  s.freeRollAvailable = true;
  s.legalActions = [];
  s.currentRoll = null;
  return s;
}

export function setBonus(state: GameState, playerId: string, bonus: number): GameState {
  const s = structuredClone(state);
  getPlayer(s, playerId).bonusRollsRemaining = bonus;
  return s;
}

export function roll(state: GameState, value: number): { state: GameState; events: GameEvent[] } {
  return applyCommand(state, { type: 'roll', playerId: currentPlayer(state).id, value });
}

export function choose(state: GameState, actionId: string): { state: GameState; events: GameEvent[] } {
  return applyCommand(state, { type: 'chooseAction', playerId: currentPlayer(state).id, actionId });
}

/** Бросок + выбор действия по фигуре (move или spawn). */
export function rollAndMove(state: GameState, value: number, pieceId: string, type: 'move' | 'spawn' = 'move') {
  const r = roll(state, value);
  const action = r.state.legalActions.find((a) => a.pieceId === pieceId && a.type === type);
  if (!action) {
    throw new Error(`No ${type} action for ${pieceId}; legal: ${r.state.legalActions.map((a) => a.id).join(', ')}`);
  }
  const c = choose(r.state, action.id);
  return { state: c.state, events: [...r.events, ...c.events] };
}

export function actionFor(actions: LegalAction[], pieceId: string, type: 'move' | 'spawn' = 'move'): LegalAction | undefined {
  return actions.find((a) => a.pieceId === pieceId && a.type === type);
}

/** Причины блокировки фигур на последний бросок: из состояния (если ждём выбора) или из события rollBurned. */
export function blockedOf(r: { state: GameState; events: GameEvent[] }, pieceId: string) {
  const fromState = r.state.blockedPieces.find((b) => b.pieceId === pieceId);
  if (fromState) return fromState;
  for (const e of r.events) {
    if (e.type === 'rollBurned') {
      const b = e.blockedPieces.find((x) => x.pieceId === pieceId);
      if (b) return b;
    }
  }
  return undefined;
}

export function progressOf(state: GameState, playerId: string, pieceIndex: number): number | null {
  return getPlayer(state, playerId).pieces[pieceIndex]!.progress;
}
