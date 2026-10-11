import { describe, expect, it } from 'vitest';
import { getPlayer, pieceCell } from '../src';
import { newGame, place, progressOf, rollAndMove, setTurn } from './helpers';

describe('специальные клетки', () => {
  it('7. A2 «5 вперёд» переводит на A7 при свободном пути; на A7 можно выбить соперника', () => {
    let g = place(newGame(), 'p1', 0, 0);
    const res = rollAndMove(g, 1, 'p1-1');
    expect(pieceCell(res.state, 'p1', 'p1-1')).toBe('A7');
    expect(progressOf(res.state, 'p1', 0)).toBe(6);
    const auto = res.events.find((e) => e.type === 'moved' && e.kind === 'autoForward');
    expect(auto).toMatchObject({ from: 'A2', to: 'A7', path: ['A3', 'A4', 'A5', 'A6', 'A7'] });

    // соперник на A7 (H1 + 13)
    g = place(g, 'p2', 0, 13);
    expect(pieceCell(g, 'p2', 'p2-1')).toBe('A7');
    const res2 = rollAndMove(g, 1, 'p1-1');
    expect(pieceCell(res2.state, 'p1', 'p1-1')).toBe('A7');
    expect(progressOf(res2.state, 'p2', 0)).toBeNull();
    expect(res2.events.find((e) => e.type === 'captured')).toMatchObject({ cell: 'A7', victimPieceId: 'p2-1' });
  });

  it('8. A2 «5 вперёд» не срабатывает, если A3..A6 занята или на A7 своя фигура', () => {
    const base = place(newGame(), 'p1', 0, 0);
    for (const p of [9, 10, 11, 12]) {
      // чужая на A3..A6 (H1 + 9..12)
      const g = place(base, 'p2', 0, p);
      const res = rollAndMove(g, 1, 'p1-1');
      expect(pieceCell(res.state, 'p1', 'p1-1')).toBe('A2');
      expect(res.events.find((e) => e.type === 'autoMoveCancelled')).toMatchObject({ reason: 'pathBlocked', cell: 'A2' });
      expect(progressOf(res.state, 'p2', 0)).toBe(p); // никто не выбит
    }
    // своя на A4
    const own = place(base, 'p1', 1, 3);
    const r = rollAndMove(own, 1, 'p1-1');
    expect(pieceCell(r.state, 'p1', 'p1-1')).toBe('A2');
    // своя на A7
    const ownDest = place(base, 'p1', 1, 6);
    const r2 = rollAndMove(ownDest, 1, 'p1-1');
    expect(pieceCell(r2.state, 'p1', 'p1-1')).toBe('A2');
    expect(r2.events.find((e) => e.type === 'autoMoveCancelled')).toMatchObject({ reason: 'destinationOwnPiece' });
  });

  it('9. H5 «3 вперёд» ведёт к H2 по тем же правилам', () => {
    // p1 (A1): H5 = прогресс 17; ставим на 14 (H8) и бросаем 3
    const base = place(newGame(), 'p1', 0, 14);
    expect(pieceCell(base, 'p1', 'p1-1')).toBe('H8');
    const ok = rollAndMove(base, 3, 'p1-1');
    expect(pieceCell(ok.state, 'p1', 'p1-1')).toBe('H2');
    expect(ok.events.find((e) => e.type === 'moved' && e.kind === 'autoForward')).toMatchObject({ path: ['H4', 'H3', 'H2'] });

    // чужая на H3 (p2 H1: прогресс 26 → H3? H1+26 = C1... считаем: H1 idx21, +26 = 47%28 = 19 = H3)
    const blocked = place(base, 'p2', 0, 26);
    expect(pieceCell(blocked, 'p2', 'p2-1')).toBe('H3');
    const r = rollAndMove(blocked, 3, 'p1-1');
    expect(pieceCell(r.state, 'p1', 'p1-1')).toBe('H5');

    // чужая на H2 (H1 + 27) — выбивание
    const cap = place(base, 'p2', 0, 27);
    expect(pieceCell(cap, 'p2', 'p2-1')).toBe('H2');
    const r2 = rollAndMove(cap, 3, 'p1-1');
    expect(pieceCell(r2.state, 'p1', 'p1-1')).toBe('H2');
    expect(progressOf(r2.state, 'p2', 0)).toBeNull();
  });

  it('10. H7 «5 назад» ведёт к D8; путь H8,G8,F8,E8,D8 свободен; выбивания назад нет', () => {
    // p1 (A1): H7 = прогресс 15; ставим на 12 (F8), бросок 3
    const base = place(newGame(), 'p1', 0, 12);
    expect(pieceCell(base, 'p1', 'p1-1')).toBe('F8');
    const ok = rollAndMove(base, 3, 'p1-1');
    expect(pieceCell(ok.state, 'p1', 'p1-1')).toBe('D8');
    expect(progressOf(ok.state, 'p1', 0)).toBe(10);
    expect(ok.events.find((e) => e.type === 'moved' && e.kind === 'autoBackward')).toMatchObject({
      from: 'H7',
      to: 'D8',
      path: ['H8', 'G8', 'F8', 'E8', 'D8'],
    });

    // чужая на E8 (p2 H1: idx 21 + 18 = 39%28 = 11 = E8) — промежуточная клетка обратного пути, отмена
    const blocked = place(base, 'p2', 0, 18);
    expect(pieceCell(blocked, 'p2', 'p2-1')).toBe('E8');
    const r = rollAndMove(blocked, 3, 'p1-1');
    expect(pieceCell(r.state, 'p1', 'p1-1')).toBe('H7');
    expect(r.events.find((e) => e.type === 'autoMoveCancelled')).toMatchObject({ reason: 'pathBlocked' });

    // чужая на D8 (H1 + 17 = 38%28 = 10 = D8) — отмена, не выбивание
    const dest = place(base, 'p2', 0, 17);
    expect(pieceCell(dest, 'p2', 'p2-1')).toBe('D8');
    const r2 = rollAndMove(dest, 3, 'p1-1');
    expect(pieceCell(r2.state, 'p1', 'p1-1')).toBe('H7');
    expect(progressOf(r2.state, 'p2', 0)).toBe(17);
    expect(r2.events.find((e) => e.type === 'autoMoveCancelled')).toMatchObject({ reason: 'destinationOccupied' });
    expect(r2.events.some((e) => e.type === 'captured')).toBe(false);
  });

  it('11. проход через E8 во время «5 назад» не даёт дополнительный бросок', () => {
    const base = place(newGame(), 'p1', 0, 12);
    const res = rollAndMove(base, 3, 'p1-1');
    expect(getPlayer(res.state, 'p1').bonusRollsRemaining).toBe(0);
    expect(res.events.some((e) => e.type === 'turnBalance')).toBe(false);
    // очередь перешла сопернику
    expect(res.state.turnOrder[res.state.currentPlayerIndex]).toBe('p2');
  });

  it('проход через спецклетку обычным ходом не активирует её', () => {
    // p1 с A1 бросок 3 → A4, проходя A2
    const g = place(newGame(), 'p1', 0, 0);
    const res = rollAndMove(g, 3, 'p1-1');
    expect(pieceCell(res.state, 'p1', 'p1-1')).toBe('A4');
    expect(res.events.some((e) => e.type === 'autoMoveCancelled' || (e.type === 'moved' && e.kind !== 'normal'))).toBe(false);
  });

  it('12. прямое попадание на F1 даёт +3 броска, на E8 — +1', () => {
    // F1 = прогресс 23 для A1; ставим на 20, бросок 3
    const gF = place(newGame(), 'p1', 0, 20);
    const rF = rollAndMove(gF, 3, 'p1-1');
    expect(pieceCell(rF.state, 'p1', 'p1-1')).toBe('F1');
    expect(getPlayer(rF.state, 'p1').bonusRollsRemaining).toBe(3);
    expect(rF.state.phase).toBe('awaitingRoll');
    expect(rF.state.turnOrder[rF.state.currentPlayerIndex]).toBe('p1');

    // E8 = прогресс 11; ставим на 9, бросок 2
    const gE = place(newGame(), 'p1', 0, 9);
    const rE = rollAndMove(gE, 2, 'p1-1');
    expect(pieceCell(rE.state, 'p1', 'p1-1')).toBe('E8');
    expect(getPlayer(rE.state, 'p1').bonusRollsRemaining).toBe(1);
  });

  it('«5 назад» для игрока H8, чья первая клетка H7: фигура уходит назад за свой старт (отрицательный прогресс)', () => {
    // Вопрос для подтверждения владельцем (см. README). Текущее поведение: прогресс -4, клетка D8.
    const g = place(newGame(['H8', 'A1']), 'p1', 0, 0);
    const res = rollAndMove(g, 1, 'p1-1');
    expect(pieceCell(res.state, 'p1', 'p1-1')).toBe('D8');
    expect(progressOf(res.state, 'p1', 0)).toBe(-4);
    // ей нужно 4 шага, чтобы вернуться на H8 с нулевым прогрессом, и ещё 28 до финиша
    const back = rollAndMove(setTurn(res.state, 'p1'), 4, 'p1-1');
    expect(pieceCell(back.state, 'p1', 'p1-1')).toBe('H8');
    expect(progressOf(back.state, 'p1', 0)).toBe(0);
  });
});
