import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  buildOccupancy,
  createGame,
  createSequenceDiceRoller,
  currentPlayer,
  maxProgress,
  type Corner,
  type GameState,
} from '../src';

/** Простой детерминированный ГПСЧ (mulberry32) для воспроизводимых партий. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assertInvariants(state: GameState) {
  buildOccupancy(state); // бросит исключение при двух фигурах на одной клетке
  for (const p of state.players) {
    expect(p.bonusRollsRemaining).toBeGreaterThanOrEqual(0);
    expect(p.skippedTurnsRemaining).toBeGreaterThanOrEqual(0);
    expect(p.pieces).toHaveLength(4);
    for (const piece of p.pieces) {
      if (piece.progress !== null) expect(piece.progress).toBeLessThanOrEqual(maxProgress(state.config, p.corner));
    }
  }
}

function playRandomGame(corners: Corner[], seed: number) {
  const random = rng(seed);
  const dice = () => Math.floor(random() * 6) + 1;
  let { state } = createGame({ players: corners.map((c, i) => ({ id: `p${i + 1}`, nickname: `P${i + 1}`, corner: c })) });
  let commands = 0;
  let captures = 0;
  while (state.phase !== 'finished') {
    const me = currentPlayer(state).id;
    if (state.phase === 'awaitingRoll') {
      const r = applyCommand(state, { type: 'roll', playerId: me, value: dice() });
      state = r.state;
      captures += r.events.filter((e) => e.type === 'captured').length;
    } else {
      const actions = state.legalActions;
      expect(actions.length).toBeGreaterThan(0);
      // предпочитаем выводить фигуры и ходить дальней фигурой, чтобы партия сходилась
      const pick = actions[Math.floor(random() * actions.length)]!;
      const r = applyCommand(state, { type: 'chooseAction', playerId: me, actionId: pick.id });
      state = r.state;
      captures += r.events.filter((e) => e.type === 'captured').length;
    }
    commands += 1;
    assertInvariants(state);
    if (commands > 200_000) throw new Error('Партия не сходится');
  }
  return { state, commands, captures };
}

describe('smoke: полная партия от резерва до победы', () => {
  it.each([
    [['A1', 'H1'] as Corner[], 1],
    [['A1', 'H1', 'H8'] as Corner[], 2],
    [['A1', 'H1', 'H8', 'A8'] as Corner[], 3],
    [['A8', 'H8', 'H1', 'A1'] as Corner[], 4],
  ])('случайная партия %j (seed %i) завершается победой с соблюдением инвариантов', (corners, seed) => {
    const { state, commands } = playRandomGame(corners, seed);
    expect(state.phase).toBe('finished');
    expect(state.winnerId).not.toBeNull();
    const winner = state.players.find((p) => p.id === state.winnerId)!;
    const lap = state.config.perimeter.length;
    expect(winner.pieces.map((p) => p.progress).sort((a, b) => a! - b!)).toEqual([lap, lap + 1, lap + 2, lap + 3]);
    expect(commands).toBeGreaterThan(10);
    expect(state.version).toBe(commands);
  });

  it('детерминированный кубик воспроизводит партию', () => {
    const seq = createSequenceDiceRoller([6, 1, 6, 3, 2, 5, 4, 6, 6, 2]);
    const a = Array.from({ length: 10 }, () => seq());
    expect(a).toEqual([6, 1, 6, 3, 2, 5, 4, 6, 6, 2]);
  });
});
