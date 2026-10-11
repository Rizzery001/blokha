import {
  allCells,
  getCellForProgress,
  parseCell,
  type Cell,
  type GameState,
  type LegalAction,
} from '@blokha/game-engine';
import type { AnimOverrides } from '../game/useLocalGame';
import { glyphFor } from '../game/pieceSets';

export interface BoardPiece {
  pieceId: string;
  playerId: string;
  color: string;
  glyph: string;
  index: number;
  cell: Cell;
}

export function piecesOnBoard(state: GameState, overrides: AnimOverrides): BoardPiece[] {
  const result: BoardPiece[] = [];
  for (const player of state.players) {
    player.pieces.forEach((piece, i) => {
      const ov = overrides[piece.id];
      let cell: Cell | null = null;
      if (ov !== undefined) cell = ov === ('__reserve' as Cell) ? null : ov;
      else if (piece.progress !== null) cell = getCellForProgress(state.config, player.corner, piece.progress);
      if (cell) result.push({ pieceId: piece.id, playerId: player.id, color: player.color, glyph: glyphFor(player.pieceSet), index: i + 1, cell });
    });
  }
  return result;
}

const SPECIAL_LABELS: Record<string, { short: string; long: string; tone: 'good' | 'bad' }> = {
  A2: { short: '5 ▲', long: '5 вперёд', tone: 'good' },
  H5: { short: '3 ▲', long: '3 вперёд', tone: 'good' },
  H7: { short: '5 ▼', long: '5 назад', tone: 'bad' },
  D1: { short: '−1', long: '1 ход пропуск', tone: 'bad' },
  C8: { short: '−3', long: '3 хода пропуск', tone: 'bad' },
  E8: { short: '+1', long: '1 ход доп.', tone: 'good' },
  F1: { short: '+3', long: '3 хода доп.', tone: 'good' },
};

interface Props {
  state: GameState;
  overrides: AnimOverrides;
  theme: 'wood' | 'modern';
  selectableActions: LegalAction[];
  onPieceClick: (pieceId: string) => void;
  flashCell: Cell | null;
  highlightTargets: Cell[];
}

export function Board({ state, overrides, theme, selectableActions, onPieceClick, flashCell, highlightTargets }: Props) {
  const pieces = piecesOnBoard(state, overrides);
  const byCell = new Map<Cell, BoardPiece>();
  for (const p of pieces) byCell.set(p.cell, p);
  const selectable = new Set(selectableActions.filter((a) => a.type === 'move').map((a) => a.pieceId));
  const targets = new Set(highlightTargets);
  const homeOwner = new Map<Cell, string>();
  for (const player of state.players) {
    for (const c of state.config.homes[player.corner]!) homeOwner.set(c, player.color);
  }
  const specialLabel = (cell: Cell) => {
    const sc = state.config.specialCells[cell];
    if (!sc) return null;
    const label = SPECIAL_LABELS[cell];
    if (label) return label;
    if (sc.type === 'autoMove') return { short: `${Math.abs(sc.steps)} ${sc.steps > 0 ? '▲' : '▼'}`, long: '', tone: sc.steps > 0 ? 'good' : 'bad' } as const;
    return { short: `${sc.rolls > 0 ? '+' : ''}${sc.rolls}`, long: '', tone: sc.rolls > 0 ? 'good' : 'bad' } as const;
  };

  return (
    <div className={`theme-${theme} w-full max-w-[min(92vw,640px)] mx-auto select-none`} data-testid="board">
      <div className="board-frame rounded-2xl p-2 sm:p-3 shadow-2xl">
        <div
          className="grid gap-0 rounded-md overflow-hidden aspect-square w-full"
          style={{ gridTemplateColumns: 'minmax(0,1fr) repeat(8, minmax(0, 2.2fr)) minmax(0,1fr)', gridTemplateRows: 'minmax(0,1fr) repeat(8, minmax(0, 2.2fr)) minmax(0,1fr)' }}
        >
          {/* верхняя строка букв */}
          <Corner />
          {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((f) => (
            <Label key={`t${f}`} text={f} />
          ))}
          <Corner />
          {allCells().map((cell) => {
            const { file, rank } = parseCell(cell);
            const dark = (file + rank) % 2 === 0;
            const piece = byCell.get(cell);
            const special = specialLabel(cell);
            const home = homeOwner.get(cell);
            const isCorner = ['A1', 'H1', 'H8', 'A8'].includes(cell);
            const isSel = piece ? selectable.has(piece.pieceId) : false;
            const isTarget = targets.has(cell);
            const isFlash = flashCell === cell;
            const cellEl = (
              <div
                key={cell}
                data-testid={`cell-${cell}`}
                className={`relative min-h-0 min-w-0 ${dark ? 'cell-dark' : 'cell-light'} ${isTarget ? 'cell-target' : ''} ${isFlash ? 'animate-shake' : ''}`}
              >
                {home && !isCorner && (
                  <div
                    className="absolute inset-[18%] rounded-full opacity-70"
                    style={{ border: `3px dashed ${home}` }}
                    aria-hidden
                  />
                )}
                {home && isCorner && <div className="absolute inset-0 opacity-50" style={{ boxShadow: `inset 0 0 0 4px ${home}` }} aria-hidden />}
                {special && (
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center leading-none ${dark ? 'text-amber-100/90' : 'text-stone-800/90'}`}
                    title={special.long}
                  >
                    <span className="font-black text-[clamp(10px,2.8vw,20px)]">{special.short}</span>
                    {special.long && <span className="hidden sm:block text-[clamp(6px,1.1vw,9px)] uppercase tracking-wide opacity-80">{special.long}</span>}
                  </div>
                )}
                <span className={`absolute left-0.5 top-0 text-[clamp(6px,1.3vw,9px)] font-bold ${dark ? 'text-amber-100/40' : 'text-stone-700/40'}`}>{cell}</span>
                {piece && (
                  <button
                    type="button"
                    data-testid={`piece-${piece.pieceId}`}
                    disabled={!isSel}
                    onClick={() => isSel && onPieceClick(piece.pieceId)}
                    className={`absolute inset-[8%] flex items-center justify-center piece ${isSel ? 'piece-selectable' : 'cursor-default'} animate-pop`}
                    aria-label={`Фигура ${piece.index} на ${cell}`}
                  >
                    <PieceGlyph color={piece.color} glyph={piece.glyph} index={piece.index} />
                  </button>
                )}
              </div>
            );
            // цифра слева в начале каждой строки и справа в конце
            if (file === 0) return [<Label key={`l${rank}`} text={String(rank)} />, cellEl];
            if (file === 7) return [cellEl, <Label key={`r${rank}`} text={String(rank)} />];
            return cellEl;
          })}
          <Corner />
          {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((f) => (
            <Label key={`b${f}`} text={f} />
          ))}
          <Corner />
        </div>
      </div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return <div className="flex items-center justify-center text-[clamp(8px,1.6vw,12px)] font-bold text-stone-800/80">{text}</div>;
}
function Corner() {
  return <div />;
}

export function PieceGlyph({ color, glyph, index, size = 'board' }: { color: string; glyph: string; index: number; size?: 'board' | 'small' }) {
  const cls = size === 'board' ? 'text-[clamp(18px,6.2vw,46px)]' : 'text-[28px]';
  return (
    <span className="relative inline-flex items-center justify-center leading-none">
      <span
        className={`${cls} font-black`}
        style={{ color, WebkitTextStroke: '1.5px rgba(255,255,255,0.9)', textShadow: '0 2px 0 rgba(0,0,0,0.35)' }}
      >
        {glyph}
      </span>
      <span
        className="absolute -right-1 -bottom-1 rounded-full bg-white text-stone-900 text-[9px] font-black w-3.5 h-3.5 flex items-center justify-center shadow"
        style={{ border: `1.5px solid ${color}` }}
      >
        {index}
      </span>
    </span>
  );
}
