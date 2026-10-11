import { describe, expect, it } from 'vitest';
import { applyCommand, buildOccupancy, currentPlayer, getPlayer, pieceCell } from '../src';
import { actionFor, blockedOf, choose, newGame, place, progressOf, roll, rollAndMove, setTurn } from './helpers';

describe('выход из резерва и обычные ходы', () => {
  it('1. без шестёрки фигуру из резерва не поставить; шестёрка выставляет и даёт доп. бросок', () => {
    const g = newGame();
    for (const v of [1, 2, 3, 4, 5]) {
      const r = roll(g, v);
      expect(r.state.legalActions).toHaveLength(0);
      expect(r.events.some((e) => e.type === 'rollBurned')).toBe(true);
      // ход сгорел и перешёл к следующему
      expect(currentPlayer(r.state).id).toBe('p2');
    }
    const r6 = roll(g, 6);
    expect(r6.state.phase).toBe('awaitingAction');
    expect(r6.state.legalActions.map((a) => a.type)).toEqual(['spawn']);
    const c = choose(r6.state, r6.state.legalActions[0]!.id);
    expect(pieceCell(c.state, 'p1', 'p1-1')).toBe('A1');
    expect(progressOf(c.state, 'p1', 0)).toBe(0);
    // доп. бросок: очередь остаётся у p1, бонусный бросок доступен
    expect(currentPlayer(c.state).id).toBe('p1');
    expect(c.state.phase).toBe('awaitingRoll');
    expect(getPlayer(c.state, 'p1').bonusRollsRemaining).toBe(1);
  });

  it('2. при шестёрке можно выбрать перемещение существующей фигуры вместо вывода новой', () => {
    const g = place(newGame(), 'p1', 0, 3);
    const r = roll(g, 6);
    const ids = r.state.legalActions.map((a) => a.type).sort();
    expect(ids).toEqual(['move', 'spawn']);
    const mv = actionFor(r.state.legalActions, 'p1-1', 'move')!;
    const c = choose(r.state, mv.id);
    expect(progressOf(c.state, 'p1', 0)).toBe(9);
    expect(pieceCell(c.state, 'p1', 'p1-1')).toBe('C8');
    expect(progressOf(c.state, 'p1', 1)).toBeNull();
  });

  it('3. шестёрка на старте выбивает чужую с угла; собственная фигура блокирует постановку', () => {
    // чужая (p2, старт H1) стоит на A1: для H1 прогресс 7
    let g = place(newGame(), 'p2', 0, 7);
    expect(pieceCell(g, 'p2', 'p2-1')).toBe('A1');
    const r = roll(g, 6);
    const spawn = actionFor(r.state.legalActions, 'p1-1', 'spawn')!;
    expect(spawn.captures).toEqual({ pieceId: 'p2-1', playerId: 'p2' });
    const c = choose(r.state, spawn.id);
    expect(progressOf(c.state, 'p2', 0)).toBeNull();
    expect(pieceCell(c.state, 'p1', 'p1-1')).toBe('A1');
    expect(c.events.some((e) => e.type === 'captured')).toBe(true);

    // своя фигура на A1 — spawn недоступен
    g = place(newGame(), 'p1', 0, 0);
    const r2 = roll(g, 6);
    expect(actionFor(r2.state.legalActions, 'p1-2', 'spawn')).toBeUndefined();
    expect(r2.state.blockedPieces.some((b) => b.reason === 'cornerOccupiedByOwnPiece')).toBe(true);
    // но сама фигура может пойти на 6
    expect(actionFor(r2.state.legalActions, 'p1-1', 'move')).toBeDefined();
  });

  it('4. на клетке не может оказаться более одной фигуры (инвариант занятости)', () => {
    const g = place(place(newGame(), 'p1', 0, 2), 'p1', 1, 4);
    // ход 2 с A3 на A5 — там своя: запрещён
    const r = roll(g, 2);
    expect(actionFor(r.state.legalActions, 'p1-1')).toBeUndefined();
    expect(r.state.blockedPieces.find((b) => b.pieceId === 'p1-1')?.reason).toBe('destinationOwnPiece');
    // невозможное состояние ловится сборщиком занятости
    const broken = place(g, 'p1', 1, 2);
    expect(() => buildOccupancy(broken)).toThrow(/Invariant/);
  });

  it('5. обычный ход A1 → A5 (бросок 4) заблокирован любой фигурой на A3', () => {
    const base = place(newGame(), 'p1', 0, 0);
    // чужая на A3: p2 (H1) прогресс 9
    const g1 = place(base, 'p2', 0, 9);
    expect(pieceCell(g1, 'p2', 'p2-1')).toBe('A3');
    const r1 = roll(g1, 4);
    expect(actionFor(r1.state.legalActions, 'p1-1')).toBeUndefined();
    expect(blockedOf(r1, 'p1-1')).toMatchObject({ reason: 'pathBlocked', cell: 'A3' });
    // своя на A3
    const g2 = place(base, 'p1', 1, 2);
    const r2 = roll(g2, 4);
    expect(actionFor(r2.state.legalActions, 'p1-1')).toBeUndefined();
    // при свободном пути ход разрешён
    const r3 = roll(base, 4);
    expect(actionFor(r3.state.legalActions, 'p1-1')?.to).toBe('A5');
  });

  it('6. при свободном пути точное попадание на соперника выбивает его', () => {
    let g = place(newGame(), 'p1', 0, 0);
    g = place(g, 'p2', 0, 11); // H1 + 11 = A5
    expect(pieceCell(g, 'p2', 'p2-1')).toBe('A5');
    const res = rollAndMove(g, 4, 'p1-1');
    expect(pieceCell(res.state, 'p1', 'p1-1')).toBe('A5');
    expect(progressOf(res.state, 'p2', 0)).toBeNull();
    const cap = res.events.find((e) => e.type === 'captured');
    expect(cap).toMatchObject({ victimPieceId: 'p2-1', byPieceId: 'p1-1', cell: 'A5' });
  });

  it('движок отвергает команды не в свою очередь, неверную фазу и неизвестные действия', () => {
    const g = newGame();
    expect(() => applyCommand(g, { type: 'roll', playerId: 'p2', value: 3 })).toThrow(/ходит/);
    expect(() => applyCommand(g, { type: 'chooseAction', playerId: 'p1', actionId: 'move:p1-1' })).toThrow();
    expect(() => applyCommand(g, { type: 'roll', playerId: 'p1', value: 7 })).toThrow(/кубика/);
    const r = roll(g, 6);
    expect(() => choose(r.state, 'move:p1-1')).toThrow(/Недопустимое действие/);
    // повторный бросок в фазе выбора фигуры запрещён
    expect(() => roll(r.state, 2)).toThrow();
    // версия растёт
    expect(r.state.version).toBe(g.version + 1);
  });

  it('очередь по порядку лобби, не по углам', () => {
    const g = setTurn(newGame(['H8', 'A1', 'A8']), 'p1');
    const r1 = roll(g, 1); // сгорает
    expect(currentPlayer(r1.state).id).toBe('p2');
    const r2 = roll(r1.state, 1);
    expect(currentPlayer(r2.state).id).toBe('p3');
    const r3 = roll(r2.state, 1);
    expect(currentPlayer(r3.state).id).toBe('p1');
  });
});
