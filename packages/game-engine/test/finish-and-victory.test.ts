import { describe, expect, it } from 'vitest';
import { checkVictory, getPlayer, pieceCell } from '../src';
import { actionFor, blockedOf, newGame, place, progressOf, roll, rollAndMove, setTurn } from './helpers';

describe('полный круг, диагональ и победа', () => {
  it('18. после 28 шагов фигура A1 снова на A1 с признаком круга; дальше B2, C3, D4', () => {
    let s = place(newGame(), 'p1', 0, 22);
    s = rollAndMove(setTurn(s, 'p1'), 6, 'p1-1').state; // 28
    expect(pieceCell(s, 'p1', 'p1-1')).toBe('A1');
    expect(progressOf(s, 'p1', 0)).toBe(28);
    expect(getPlayer(s, 'p1').pieces[0]!.status).toBe('perimeter');
    // шестёрка дала бонусный бросок — продолжаем тем же игроком
    s = rollAndMove(s, 1, 'p1-1').state;
    expect(pieceCell(s, 'p1', 'p1-1')).toBe('B2');
    expect(getPlayer(s, 'p1').pieces[0]!.status).toBe('finish');
    s = rollAndMove(setTurn(s, 'p1'), 2, 'p1-1').state;
    expect(pieceCell(s, 'p1', 'p1-1')).toBe('D4');
    expect(getPlayer(s, 'p1').pieces[0]!.status).toBe('locked');
  });

  it('19. с C3 при свободной D4 бросок 1 разрешён; бросок 2 (превышение) запрещён', () => {
    const s = place(newGame(), 'p1', 0, 30);
    const r1 = roll(s, 1);
    expect(actionFor(r1.state.legalActions, 'p1-1')?.to).toBe('D4');
    const r2 = roll(s, 2);
    expect(actionFor(r2.state.legalActions, 'p1-1')).toBeUndefined();
    expect(blockedOf(r2, 'p1-1')?.reason).toBe('overshootsFinish');
    // с угла после круга (28) бросок 3 → D4, бросок 4 → запрещён
    const s2 = place(newGame(), 'p1', 0, 28);
    expect(actionFor(roll(s2, 3).state.legalActions, 'p1-1')?.to).toBe('D4');
    expect(actionFor(roll(s2, 4).state.legalActions, 'p1-1')).toBeUndefined();
  });

  it('20. если D4 занята своей, другая фигура не может перепрыгнуть её или занять ту же клетку', () => {
    let s = place(place(newGame(), 'p1', 0, 31), 'p1', 1, 30);
    expect(actionFor(roll(s, 1).state.legalActions, 'p1-2')).toBeUndefined();
    // фигура на B2 (29) при занятой C3 и D4 не ходит никуда
    s = place(s, 'p1', 2, 29);
    for (const v of [1, 2, 3]) expect(actionFor(roll(s, v).state.legalActions, 'p1-3')).toBeUndefined();
    // заблокированная (locked) фигура никогда не ходит
    expect(blockedOf(roll(s, 1), 'p1-1')?.reason).toBe('locked');
  });

  it('нельзя перескочить через свою фигуру на углу при входе на диагональ', () => {
    // p1-1 на B1 (27), p1-2 на A1 после круга (28); бросок 2 → B2 через A1 — запрещён
    const s = place(place(newGame(), 'p1', 0, 27), 'p1', 1, 28);
    const r = roll(s, 2);
    expect(actionFor(r.state.legalActions, 'p1-1')).toBeUndefined();
    expect(blockedOf(r, 'p1-1')).toMatchObject({ reason: 'pathBlocked', cell: 'A1' });
  });

  it('21. враг выбивает фигуру на углу A1 даже после круга; внутренние B2/C3/D4 недоступны врагам', () => {
    // p1-1 на A1 после круга (28); p2 (H1) на B1 = H1 + 6; бросок 1 → A1 с выбиванием
    let s = place(place(newGame(), 'p1', 0, 28), 'p2', 0, 6);
    expect(pieceCell(s, 'p2', 'p2-1')).toBe('B1');
    s = setTurn(s, 'p2');
    const res = rollAndMove(s, 1, 'p2-1');
    expect(pieceCell(res.state, 'p2', 'p2-1')).toBe('A1');
    expect(progressOf(res.state, 'p1', 0)).toBeNull();
    expect(getPlayer(res.state, 'p1').pieces[0]!.status).toBe('reserve');

    // внутренние клетки: p2 с A1 (прогресс 7) никогда не попадает на B2/C3/D4 — его путь A2..., а p1 на B2 не мешает
    let s2 = place(place(newGame(), 'p1', 0, 29), 'p2', 0, 7);
    s2 = setTurn(s2, 'p2');
    for (const v of [1, 2, 3, 4, 5, 6]) {
      const a = actionFor(roll(s2, v).state.legalActions, 'p2-1');
      expect(a && a.type === 'move' ? a.to : null).not.toBe('B2');
      expect(a && a.type === 'move' ? a.path.includes('B2') : false).toBe(false);
    }
    const r1 = rollAndMove(s2, 1, 'p2-1');
    expect(pieceCell(r1.state, 'p2', 'p2-1')).toBe('A7'); // A2 → бонус 5 вперёд
    expect(progressOf(r1.state, 'p1', 0)).toBe(29); // фигура на B2 не тронута
  });

  it('22. победа только при заполнении четырёх финишных клеток своего игрока', () => {
    let s = place(place(place(newGame(), 'p1', 0, 31), 'p1', 1, 30), 'p1', 2, 29);
    s = place(s, 'p1', 3, 27); // последняя на B1
    expect(checkVictory(s, 'p1')).toBe(false);
    const res = rollAndMove(s, 1, 'p1-4');
    expect(res.state.phase).toBe('finished');
    expect(res.state.winnerId).toBe('p1');
    expect(res.events.at(-1)).toMatchObject({ type: 'gameFinished', winnerId: 'p1' });
    expect(() => roll(res.state, 3)).toThrow(/завершена/);

    // свежевыставленная фигура на A1 (прогресс 0) не считается финишем
    const fake = place(place(place(place(newGame(), 'p1', 0, 31), 'p1', 1, 30), 'p1', 2, 29), 'p1', 3, 0);
    expect(checkVictory(fake, 'p1')).toBe(false);

    // фигуры на чужой диагонали невозможны; у p2 (H1) проверяется его диагональ
    const s2 = place(place(place(place(newGame(), 'p2', 0, 31), 'p2', 1, 30), 'p2', 2, 29), 'p2', 3, 28);
    expect(checkVictory(s2, 'p2')).toBe(true);
    expect(checkVictory(s2, 'p1')).toBe(false);
    expect([28, 29, 30, 31].map((p, i) => pieceCell(s2, 'p2', `p2-${i + 1}`))).toEqual(['E4', 'F3', 'G2', 'H1']);
  });

  it('23. вход на диагональ для H8 и A8 работает с повёрнутыми маршрутами', () => {
    const s = place(newGame(['H8', 'A8']), 'p1', 0, 26);
    const res = rollAndMove(s, 5, 'p1-1'); // 31 = E5
    expect(pieceCell(res.state, 'p1', 'p1-1')).toBe('E5');
    expect(res.events.find((e) => e.type === 'moved')).toMatchObject({ path: ['G8', 'H8', 'G7', 'F6', 'E5'] });
    const s2 = setTurn(place(newGame(['H8', 'A8']), 'p2', 0, 27), 'p2');
    const res2 = rollAndMove(s2, 4, 'p2-1');
    expect(pieceCell(res2.state, 'p2', 'p2-1')).toBe('D5');
  });
});
