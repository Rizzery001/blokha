export interface PieceSetDef {
  id: string;
  name: string;
  glyph: string;
}

export const PIECE_SETS: PieceSetDef[] = [
  { id: 'pawn', name: 'Пешки', glyph: '♟' },
  { id: 'knight', name: 'Кони', glyph: '♞' },
  { id: 'rook', name: 'Ладьи', glyph: '♜' },
  { id: 'bishop', name: 'Слоны', glyph: '♝' },
  { id: 'queen', name: 'Ферзи', glyph: '♛' },
  { id: 'king', name: 'Короли', glyph: '♚' },
];

export const PLAYER_COLORS = [
  { id: '#e8590c', name: 'Оранжевый' },
  { id: '#1c7ed6', name: 'Синий' },
  { id: '#2f9e44', name: 'Зелёный' },
  { id: '#9c36b5', name: 'Фиолетовый' },
  { id: '#e03131', name: 'Красный' },
  { id: '#0ca678', name: 'Бирюзовый' },
];

export function glyphFor(setId: string): string {
  return PIECE_SETS.find((s) => s.id === setId)?.glyph ?? '●';
}

import type { Corner } from '@blokha/game-engine';

/** Подписи углов для интерфейса: игроку понятнее «Угол 1», чем «A1». */
export const CORNER_INFO: Record<Corner, { num: number; where: string; x: 0 | 1; y: 0 | 1 }> = {
  A1: { num: 1, where: 'слева внизу', x: 0, y: 1 },
  H1: { num: 2, where: 'справа внизу', x: 1, y: 1 },
  H8: { num: 3, where: 'справа вверху', x: 1, y: 0 },
  A8: { num: 4, where: 'слева вверху', x: 0, y: 0 },
};

export const cornerName = (c: Corner) => `Угол ${CORNER_INFO[c].num}`;
export const cornerTitle = (c: Corner) => `${cornerName(c)} — ${CORNER_INFO[c].where} (${c})`;
