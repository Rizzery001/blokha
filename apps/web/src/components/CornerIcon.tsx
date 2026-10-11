import type { Corner } from '@blokha/game-engine';
import { CORNER_INFO } from '../game/pieceSets';

/** Мини-доска 2×2 с отмеченным углом. */
export function CornerIcon({ corner, color = 'currentColor', size = 16 }: { corner: Corner; color?: string; size?: number }) {
  const { x, y } = CORNER_INFO[corner];
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="shrink-0 inline-block align-middle">
      <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" />
      <line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
      <line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
      <rect x={x === 0 ? 2 : 9} y={y === 0 ? 2 : 9} width="5" height="5" rx="1" fill={color} />
    </svg>
  );
}
