import boardJson from './config/board.json';
import type { BoardConfig, Cell, Corner, PieceStatus } from './types';

export const DEFAULT_BOARD_CONFIG = boardJson as unknown as BoardConfig;

export const CORNERS: readonly Corner[] = ['A1', 'H1', 'H8', 'A8'];

/** Длина круга по периметру (28 для доски 8×8). */
export function lapLength(config: BoardConfig): number {
  return config.perimeter.length;
}

/** Максимальный прогресс = угол после круга + число внутренних финишных клеток (28 + 3 = 31). */
export function maxProgress(config: BoardConfig, corner: Corner): number {
  return lapLength(config) + homeCells(config, corner).length - 1;
}

export function homeCells(config: BoardConfig, corner: Corner): Cell[] {
  const home = config.homes[corner];
  if (!home) throw new Error(`No home diagonal for corner ${corner}`);
  return home;
}

export function cornerIndex(config: BoardConfig, corner: Corner): number {
  const idx = config.perimeter.indexOf(corner);
  if (idx < 0) throw new Error(`Corner ${corner} is not on perimeter`);
  return idx;
}

/**
 * Клетка для прогресса фигуры конкретного игрока.
 * progress <= lap (включая отрицательные значения после «назад») — периметр;
 * progress в (lap, lap + homes - 1] — личная диагональ.
 */
export function getCellForProgress(config: BoardConfig, corner: Corner, progress: number): Cell {
  const lap = lapLength(config);
  if (progress <= lap) {
    const idx = (((cornerIndex(config, corner) + progress) % lap) + lap) % lap;
    const cell = config.perimeter[idx];
    if (!cell) throw new Error(`Perimeter index out of range: ${idx}`);
    return cell;
  }
  const home = homeCells(config, corner);
  const cell = home[progress - lap];
  if (!cell) throw new Error(`Progress ${progress} beyond finish for ${corner}`);
  return cell;
}

/** Список клеток пути от progress (исключая) до progress + steps (включая). steps может быть отрицательным. */
export function getPathForMove(
  config: BoardConfig,
  corner: Corner,
  fromProgress: number,
  steps: number,
): { progress: number; cell: Cell }[] {
  const dir = Math.sign(steps);
  const path: { progress: number; cell: Cell }[] = [];
  for (let i = 1; i <= Math.abs(steps); i++) {
    const p = fromProgress + i * dir;
    path.push({ progress: p, cell: getCellForProgress(config, corner, p) });
  }
  return path;
}

export function statusForProgress(config: BoardConfig, corner: Corner, progress: number | null): PieceStatus {
  if (progress === null) return 'reserve';
  const lap = lapLength(config);
  if (progress <= lap) return 'perimeter';
  if (progress >= maxProgress(config, corner)) return 'locked';
  return 'finish';
}

export function isCornerAfterLap(config: BoardConfig, progress: number | null): boolean {
  return progress !== null && progress === lapLength(config);
}

export function isCellOnPerimeter(config: BoardConfig, cell: Cell): boolean {
  return config.perimeter.includes(cell);
}

export const FILES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export function parseCell(cell: Cell): { file: number; rank: number } {
  return { file: FILES.indexOf(cell[0] as (typeof FILES)[number]), rank: Number(cell.slice(1)) };
}

export function allCells(): Cell[] {
  const cells: Cell[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    for (const f of FILES) cells.push(`${f}${rank as 1}` as Cell);
  }
  return cells;
}
