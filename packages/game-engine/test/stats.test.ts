import { describe, expect, it } from 'vitest';
import { newGame, place, roll, rollAndMove, setTurn } from './helpers';

describe('статистика партии', () => {
  it('считает броски, шестёрки, серии, выбивания, бонусы, штрафы и сгоревшие броски', () => {
    let s = newGame();
    s = roll(s, 2).state; // сгорел
    expect(s.stats['p1']).toMatchObject({ rolls: 1, burnedRolls: 1, sixes: 0 });
    s = setTurn(s, 'p1');
    s = rollAndMove(s, 6, 'p1-1', 'spawn').state; // серия 1
    s = rollAndMove(s, 6, 'p1-1').state; // A1→A7? 0+6 = A7 ; серия 2
    expect(s.stats['p1']).toMatchObject({ sixes: 2, sixStreak: 2, bestSixStreak: 2, spawned: 1, stepsMoved: 6 });
    // соперник на A8 (H1 + 14), p1 с A7 бросает 1 → выбивание
    s = place(s, 'p2', 0, 14);
    s = rollAndMove(s, 1, 'p1-1').state;
    expect(s.stats['p1']!.captures).toBe(1);
    expect(s.stats['p2']!.captured).toBe(1);
    expect(s.stats['p1']!.sixStreak).toBe(0);
    // F1: прогресс 23 — ставим на 20, бросок 3 → +3 бонус
    s = place(setTurn(s, 'p1'), 'p1', 1, 20);
    s = rollAndMove(s, 3, 'p1-2').state;
    expect(s.stats['p1']!.bonusCells).toBe(1);
    // C8: прогресс 9 — третьей фигурой с B8 (8), бросок 1 → штраф
    s = place(setTurn(s, 'p1'), 'p1', 2, 8);
    s = rollAndMove(s, 1, 'p1-3').state;
    expect(s.stats['p1']!.penaltyCells).toBe(1);
  });

  it('считает круги и финиш', () => {
    let s = place(newGame(), 'p1', 0, 27);
    s = rollAndMove(s, 1, 'p1-1').state; // 28 — круг
    expect(s.stats['p1']!.lapsCompleted).toBe(1);
    s = rollAndMove(setTurn(s, 'p1'), 3, 'p1-1').state; // 31 — финиш
    expect(s.stats['p1']!.piecesFinished).toBe(1);
  });
});
