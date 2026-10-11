import { describe, expect, it } from 'vitest';
import { DEFAULT_BOARD_CONFIG, getCellForProgress, getPathForMove, maxProgress, statusForProgress } from '../src';

const cfg = DEFAULT_BOARD_CONFIG;

describe('геометрия доски', () => {
  it('17. периметр из 28 уникальных клеток в правильном порядке по часовой стрелке', () => {
    expect(cfg.perimeter).toHaveLength(28);
    expect(new Set(cfg.perimeter).size).toBe(28);
    expect(cfg.perimeter.slice(0, 8)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8']);
    expect(cfg.perimeter[8]).toBe('B8');
    expect(cfg.perimeter[14]).toBe('H8');
    expect(cfg.perimeter[15]).toBe('H7');
    expect(cfg.perimeter[21]).toBe('H1');
    expect(cfg.perimeter[22]).toBe('G1');
    expect(cfg.perimeter[27]).toBe('B1');
    // следующая после B1 — снова A1
    expect(getCellForProgress(cfg, 'A1', 28)).toBe('A1');
  });

  it('18. после 28 шагов фигура A1 снова на A1, далее B2(29), C3(30), D4(31)', () => {
    expect(getCellForProgress(cfg, 'A1', 0)).toBe('A1');
    expect(getCellForProgress(cfg, 'A1', 1)).toBe('A2');
    expect(getCellForProgress(cfg, 'A1', 27)).toBe('B1');
    expect(getCellForProgress(cfg, 'A1', 28)).toBe('A1');
    expect(getCellForProgress(cfg, 'A1', 29)).toBe('B2');
    expect(getCellForProgress(cfg, 'A1', 30)).toBe('C3');
    expect(getCellForProgress(cfg, 'A1', 31)).toBe('D4');
    expect(maxProgress(cfg, 'A1')).toBe(31);
    expect(() => getCellForProgress(cfg, 'A1', 32)).toThrow();
  });

  it('23. углы H1/H8/A8 используют повёрнутые маршруты и свои диагонали', () => {
    expect(getCellForProgress(cfg, 'H1', 0)).toBe('H1');
    expect(getCellForProgress(cfg, 'H1', 1)).toBe('G1');
    expect(getCellForProgress(cfg, 'H1', 7)).toBe('A1');
    expect(getCellForProgress(cfg, 'H1', 28)).toBe('H1');
    expect([29, 30, 31].map((p) => getCellForProgress(cfg, 'H1', p))).toEqual(['G2', 'F3', 'E4']);

    expect(getCellForProgress(cfg, 'H8', 1)).toBe('H7');
    expect(getCellForProgress(cfg, 'H8', 7)).toBe('H1');
    expect([28, 29, 30, 31].map((p) => getCellForProgress(cfg, 'H8', p))).toEqual(['H8', 'G7', 'F6', 'E5']);

    expect(getCellForProgress(cfg, 'A8', 1)).toBe('B8');
    expect(getCellForProgress(cfg, 'A8', 27)).toBe('A7');
    expect([28, 29, 30, 31].map((p) => getCellForProgress(cfg, 'A8', p))).toEqual(['A8', 'B7', 'C6', 'D5']);
  });

  it('путь хода включает все промежуточные клетки и конечную', () => {
    expect(getPathForMove(cfg, 'A1', 0, 4).map((s) => s.cell)).toEqual(['A2', 'A3', 'A4', 'A5']);
    expect(getPathForMove(cfg, 'A1', 26, 4).map((s) => s.cell)).toEqual(['B1', 'A1', 'B2', 'C3']);
    expect(getPathForMove(cfg, 'A1', 15, -5).map((s) => s.cell)).toEqual(['H8', 'G8', 'F8', 'E8', 'D8']);
  });

  it('статусы фигур по прогрессу', () => {
    expect(statusForProgress(cfg, 'A1', null)).toBe('reserve');
    expect(statusForProgress(cfg, 'A1', 0)).toBe('perimeter');
    expect(statusForProgress(cfg, 'A1', 28)).toBe('perimeter');
    expect(statusForProgress(cfg, 'A1', 29)).toBe('finish');
    expect(statusForProgress(cfg, 'A1', 30)).toBe('finish');
    expect(statusForProgress(cfg, 'A1', 31)).toBe('locked');
  });

  it('спецклетки совпадают с физической доской', () => {
    expect(Object.keys(cfg.specialCells).sort()).toEqual(['A2', 'C8', 'D1', 'E8', 'F1', 'H5', 'H7']);
    expect(cfg.specialCells['A2']).toMatchObject({ type: 'autoMove', steps: 5 });
    expect(cfg.specialCells['H5']).toMatchObject({ type: 'autoMove', steps: 3 });
    expect(cfg.specialCells['H7']).toMatchObject({ type: 'autoMove', steps: -5, captureOnDestination: false });
    expect(cfg.specialCells['D1']).toMatchObject({ type: 'turnBalance', rolls: -1 });
    expect(cfg.specialCells['C8']).toMatchObject({ type: 'turnBalance', rolls: -3 });
    expect(cfg.specialCells['E8']).toMatchObject({ type: 'turnBalance', rolls: 1 });
    expect(cfg.specialCells['F1']).toMatchObject({ type: 'turnBalance', rolls: 3 });
  });
});
