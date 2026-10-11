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
