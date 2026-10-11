import { describe, expect, it } from 'vitest';
import { applyCommand, chooseBotAction, createGame, currentPlayer, type Corner } from '../src';
import { newGame, place, roll } from './helpers';

describe('робот', () => {
  it('выбирает только легальные действия и предпочитает выбивание', () => {
    // p1 (A1): фигура на A1 (0) и на A4 (3); p2 на A5 (H1 + 11). Бросок 1: A1→A2 (бонус) или A4→A5 (выбивание)
    let s = place(place(newGame(), 'p1', 0, 0), 'p1', 1, 3);
    s = place(s, 'p2', 0, 11);
    const r = roll(s, 1);
    const a = chooseBotAction(r.state, 'p1', () => 0);
    expect(r.state.legalActions.some((x) => x.id === a.id)).toBe(true);
    expect(a.captures).not.toBeNull();
  });

  it('полная партия четырёх роботов завершается победой', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const corners: Corner[] = ['A1', 'H1', 'H8', 'A8'];
    let { state } = createGame({ players: corners.map((c, i) => ({ id: `b${i}`, nickname: `Бот ${i}`, corner: c })) });
    let n = 0;
    while (state.phase !== 'finished' && n < 100000) {
      const me = currentPlayer(state).id;
      if (state.phase === 'awaitingRoll') state = applyCommand(state, { type: 'roll', playerId: me, value: Math.floor(random() * 6) + 1 }).state;
      else state = applyCommand(state, { type: 'chooseAction', playerId: me, actionId: chooseBotAction(state, me, random).id }).state;
      n++;
    }
    expect(state.phase).toBe('finished');
  });
});
