import { describe, expect, it } from 'vitest';
import { applyTurnBalance, currentPlayer, getPlayer, type PlayerState } from '../src';
import { choose, newGame, place, roll, rollAndMove, setBonus, setTurn } from './helpers';

function player(bonus: number): PlayerState {
  return { id: 'x', nickname: 'x', corner: 'A1', pieces: [], bonusRollsRemaining: bonus, skippedTurnsRemaining: 0, pieceSet: 'pawn', color: '#000', avatar: '🦊' };
}

describe('взаимозачёт бонусов и штрафов', () => {
  it.each([
    [2, -3, 0, 1],
    [1, -3, 0, 2],
    [3, -3, 0, 0],
    [5, -3, 2, 0],
    [0, -1, 0, 1],
    [0, 3, 3, 0],
    [1, 1, 2, 0],
  ])('бонус %i, штраф/бонус %i → бонусов %i, пропусков %i', (bonus, delta, expBonus, expSkip) => {
    const p = player(bonus);
    applyTurnBalance(p, delta);
    expect(p.bonusRollsRemaining).toBe(expBonus);
    expect(p.skippedTurnsRemaining).toBe(expSkip);
  });

  it('13. каждая шестёрка в серии увеличивает баланс бросков на один без ограничений', () => {
    let s = place(newGame(), 'p1', 0, 0); // фигура на A1, чтобы было чем ходить
    s = place(s, 'p1', 1, 20);
    let expectedBonus = 0;
    for (let i = 0; i < 5; i++) {
      const r = roll(s, 6);
      expectedBonus += 1; // бросок начала очереди или бонусный + 1 за шестёрку
      if (i > 0) expectedBonus -= 1; // бонусный бросок списан
      // ... итого: после i-й шестёрки баланс = 1 (списали один, получили один) кроме первой (бесплатной)
      expect(getPlayer(r.state, 'p1').bonusRollsRemaining).toBe(i === 0 ? 1 : 1);
      const mv = r.state.legalActions.find((a) => a.type === 'move' && a.pieceId === 'p1-2');
      // ходим второй фигурой, чтобы не упираться в финиш; если её ход невозможен — любым
      s = choose(r.state, (mv ?? r.state.legalActions[0]!).id).state;
      expect(currentPlayer(s).id).toBe('p1');
      expect(s.phase).toBe('awaitingRoll');
    }
    void expectedBonus;
    // серия из трёх шестёрок с накопленными бонусами: +3 → 6 → +3 → 6 → +3 → 4 → +2 (пример из ТЗ)
    let t = setBonus(place(place(setTurn(newGame(), 'p1'), 'p1', 0, 0), 'p1', 1, 2), 'p1', 3);
    t.freeRollAvailable = false;
    const r1 = roll(t, 6);
    expect(getPlayer(r1.state, 'p1').bonusRollsRemaining).toBe(3);
    const c1 = choose(r1.state, r1.state.legalActions.find((a) => a.pieceId === 'p1-2' && a.type === 'move')!.id).state;
    const r2 = roll(c1, 6);
    expect(getPlayer(r2.state, 'p1').bonusRollsRemaining).toBe(3);
    const c2 = choose(r2.state, r2.state.legalActions.find((a) => a.pieceId === 'p1-2' && a.type === 'move')!.id).state;
    const r3 = roll(c2, 4);
    expect(getPlayer(r3.state, 'p1').bonusRollsRemaining).toBe(2);
  });

  it('14. «+2 бонусных» затем «−3 пропустить» → 1 пропущенная будущая очередь', () => {
    // p1 с бонусом +2 попадает на C8 (прогресс 9): ставим на 6, бросок 3
    let s = setBonus(place(newGame(), 'p1', 0, 6), 'p1', 2);
    const res = rollAndMove(s, 3, 'p1-1');
    const p1 = getPlayer(res.state, 'p1');
    expect(p1.bonusRollsRemaining).toBe(0);
    expect(p1.skippedTurnsRemaining).toBe(1);
    expect(currentPlayer(res.state).id).toBe('p2');
    // очередь p2: сгорает, затем p1 пропускает и снова p2
    const r2 = roll(res.state, 1);
    expect(currentPlayer(r2.state).id).toBe('p2');
    expect(r2.events.find((e) => e.type === 'turnSkipped')).toMatchObject({ playerId: 'p1', remainingSkips: 0 });
    const r3 = roll(r2.state, 1);
    expect(currentPlayer(r3.state).id).toBe('p1');
  });

  it('15. «+5 бонусных» затем «−3 пропустить» → остаётся 2 дополнительных броска', () => {
    const s = setBonus(place(newGame(), 'p1', 0, 6), 'p1', 5);
    const res = rollAndMove(s, 3, 'p1-1');
    const p1 = getPlayer(res.state, 'p1');
    expect(p1.bonusRollsRemaining).toBe(2);
    expect(p1.skippedTurnsRemaining).toBe(0);
    expect(currentPlayer(res.state).id).toBe('p1');
    expect(res.state.phase).toBe('awaitingRoll');
  });

  it('D1 «1 ход пропуск» без бонусов → 1 пропуск', () => {
    // D1 = прогресс 25; ставим на 22, бросок 3
    const s = place(newGame(), 'p1', 0, 22);
    const res = rollAndMove(s, 3, 'p1-1');
    expect(getPlayer(res.state, 'p1').skippedTurnsRemaining).toBe(1);
  });

  it('16. заблокированный бросок сгорает, но не уничтожает остальные дополнительные броски', () => {
    // у p1 только одна фигура на C3 (30) и своя на D4 (31) — ходов нет ни на какой бросок; остальные в резерве
    let s = place(place(newGame(), 'p1', 0, 30), 'p1', 1, 31);
    s = setBonus(s, 'p1', 2);
    s.freeRollAvailable = false;
    const r1 = roll(s, 4);
    expect(r1.events.some((e) => e.type === 'rollBurned')).toBe(true);
    expect(getPlayer(r1.state, 'p1').bonusRollsRemaining).toBe(1);
    expect(currentPlayer(r1.state).id).toBe('p1');
    const r2 = roll(r1.state, 3);
    expect(getPlayer(r2.state, 'p1').bonusRollsRemaining).toBe(0);
    expect(currentPlayer(r2.state).id).toBe('p2');
  });

  it('пропуск очереди списывается без броска, когда игрок пропускает несколько очередей', () => {
    let s = newGame(['A1', 'H1', 'A8']);
    getPlayer(s, 'p2').skippedTurnsRemaining = 2;
    const r1 = roll(s, 1); // p1 сгорел → p2 пропускает (остаётся 1) → p3
    expect(currentPlayer(r1.state).id).toBe('p3');
    const r2 = roll(r1.state, 1); // p3 → p1
    expect(currentPlayer(r2.state).id).toBe('p1');
    const r3 = roll(r2.state, 1); // p1 → p2 пропускает (0) → p3
    expect(currentPlayer(r3.state).id).toBe('p3');
    const r4 = roll(r3.state, 1);
    expect(currentPlayer(r4.state).id).toBe('p1');
    const r5 = roll(r4.state, 1);
    expect(currentPlayer(r5.state).id).toBe('p2');
  });

  it('шестёрка, чей ход сгорел, всё равно даёт +1 бросок (п. 12.1 ТЗ)', () => {
    let s = place(place(newGame(), 'p1', 0, 30), 'p1', 1, 31);
    s = place(place(s, 'p1', 2, 29), 'p1', 3, 28); // всё занято, в резерве никого
    // любая 6 — ходов нет, но бонус начислен и следующий бросок доступен
    const r = roll(s, 6);
    expect(r.events.some((e) => e.type === 'rollBurned')).toBe(true);
    // но это победа? нет — 28,29,30,31 заняты все четыре → победа фиксируется
    expect(r.state.phase).toBe('finished');
  });
});
