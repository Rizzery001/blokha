import { allCells, getCellForProgress, parseCell, type Cell, type GameState, type LegalAction } from '@blokha/game-engine';
import type { ArrowOverlay } from '../game/usePresenter';
import type { AnimOverrides } from '../game/useLocalGame';
import { glyphFor } from '../game/pieceSets';
import { PieceShape } from './PieceShapes';

export interface BoardPiece {
  pieceId: string;
  playerId: string;
  color: string;
  glyph: string;
  index: number;
  cell: Cell;
  moving: boolean;
  /** фигура прошла полный круг (на углу или на диагонали) */
  lapDone: boolean;
  onFinish: boolean;
}

export function piecesOnBoard(state: GameState, overrides: AnimOverrides): BoardPiece[] {
  const result: BoardPiece[] = [];
  for (const player of state.players) {
    player.pieces.forEach((piece, i) => {
      const ov = overrides[piece.id];
      let cell: Cell | null = null;
      if (ov !== undefined) cell = ov === ('__reserve' as Cell) ? null : ov;
      else if (piece.progress !== null) cell = getCellForProgress(state.config, player.corner, piece.progress);
      const lap = state.config.perimeter.length;
      const lapDone = piece.progress !== null && piece.progress >= lap && ov === undefined;
      const onFinish = piece.progress !== null && piece.progress > lap && ov === undefined;
      if (cell) result.push({ pieceId: piece.id, playerId: player.id, color: player.color, glyph: player.pieceSet, index: i + 1, cell, moving: ov !== undefined, lapDone, onFinish });
    });
  }
  return result;
}

/** Подписи как на физической доске: число крупно, слово трафаретом под ним. */
const SPECIAL_LABELS: Record<string, { num: string; word: string; tone: 'good' | 'bad'; title: string }> = {
  A2: { num: '5', word: 'вперёд', tone: 'good', title: 'Автоматически вперёд на 5 клеток' },
  H5: { num: '3', word: 'вперёд', tone: 'good', title: 'Автоматически вперёд на 3 клетки' },
  H7: { num: '5', word: 'назад', tone: 'bad', title: 'Автоматически назад на 5 клеток' },
  D1: { num: '1', word: 'ход пропуск', tone: 'bad', title: 'Пропуск одного хода' },
  C8: { num: '3', word: 'хода пропуск', tone: 'bad', title: 'Пропуск трёх ходов' },
  E8: { num: '1', word: 'ход доп.', tone: 'good', title: 'Один дополнительный бросок' },
  F1: { num: '3', word: 'хода доп.', tone: 'good', title: 'Три дополнительных броска' },
};

const FILES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Центр клетки в координатах 0..100 для SVG-оверлея (с учётом рамки подписей 1 : 2.2 : 1). */
function cellCenter(cell: Cell): { x: number; y: number } {
  const { file, rank } = parseCell(cell);
  const unit = 100 / (2 + 8 * 2.2);
  const x = unit * (1 + 2.2 * file + 1.1);
  const y = unit * (1 + 2.2 * (8 - rank) + 1.1);
  return { x, y };
}

interface Props {
  state: GameState;
  overrides: AnimOverrides;
  theme: 'wood' | 'modern';
  selectableActions: LegalAction[];
  onPieceClick: (pieceId: string) => void;
  flashCell: Cell | null;
  highlightTargets: Cell[];
  arrow: ArrowOverlay | null;
  captureCell: Cell | null;
  /** бросок кубика поверх доски */
  dice: { value: number | null; rolling: boolean; show: boolean };
  /** предпросмотр хода при наведении: путь и конечная клетка */
  preview: LegalAction | null;
  onPieceHover: (pieceId: string | null) => void;
  shake: boolean;
}

export function Board({ state, overrides, theme, selectableActions, onPieceClick, flashCell, highlightTargets, arrow, captureCell, dice, preview, onPieceHover, shake }: Props) {
  const pieces = piecesOnBoard(state, overrides);
  const byCell = new Map<Cell, BoardPiece>();
  for (const p of pieces) byCell.set(p.cell, p);
  const selectable = new Set(selectableActions.filter((a) => a.type === 'move').map((a) => a.pieceId));
  const targets = new Set(highlightTargets);
  const homeOwner = new Map<Cell, string>();
  for (const player of state.players) for (const c of state.config.homes[player.corner]!) homeOwner.set(c, player.color);
  const specialLabel = (cell: Cell) => {
    const sc = state.config.specialCells[cell];
    if (!sc) return null;
    const label = SPECIAL_LABELS[cell];
    if (label) return label;
    if (sc.type === 'autoMove') return { num: String(Math.abs(sc.steps)), word: sc.steps > 0 ? 'вперёд' : 'назад', tone: sc.steps > 0 ? 'good' : 'bad', title: '' } as const;
    return { num: String(Math.abs(sc.rolls)), word: sc.rolls > 0 ? 'доп.' : 'пропуск', tone: sc.rolls > 0 ? 'good' : 'bad', title: '' } as const;
  };

  const arrowPath = arrow ? buildArrowPath(arrow, state) : null;
  const previewPath = new Set<Cell>(preview && preview.type === 'move' ? preview.path.slice(0, -1) : []);
  const previewDest = preview ? preview.to : null;
  const previewLine = preview && preview.type === 'move' ? [preview.from, ...preview.path].map(cellCenter).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') : null;

  return (
    <div className={`theme-${theme} w-full max-w-[min(94vw,640px)] mx-auto select-none`} data-testid="board">
      <div className={`board-frame rounded-2xl p-1.5 sm:p-2.5 relative ${shake ? 'board-shake' : ''}`}>
        <div
          className="board-grid grid gap-0 rounded-md overflow-hidden aspect-square w-full"
          style={{ gridTemplateColumns: 'minmax(0,1fr) repeat(8, minmax(0, 2.2fr)) minmax(0,1fr)', gridTemplateRows: 'minmax(0,1fr) repeat(8, minmax(0, 2.2fr)) minmax(0,1fr)' }}
        >
          <Corner />
          {FILES.map((f) => <Label key={`t${f}`} text={f} />)}
          <Corner />
          {allCells().map((cell) => {
            const { file, rank } = parseCell(cell);
            const dark = (file + rank) % 2 === 0;
            const piece = byCell.get(cell);
            const special = specialLabel(cell);
            const home = homeOwner.get(cell);
            const isCorner = ['A1', 'H1', 'H8', 'A8'].includes(cell);
            const isSel = piece ? selectable.has(piece.pieceId) : false;
            const isTarget = targets.has(cell) && (!preview || previewDest === cell);
            const isFlash = flashCell === cell;
            const onPath = previewPath.has(cell);
            const isPreviewDest = previewDest === cell;
            const cellEl = (
              <div
                key={cell}
                data-testid={`cell-${cell}`}
                className={`relative min-h-0 min-w-0 ${dark ? 'cell-dark' : 'cell-light'} ${special ? (special.tone === 'good' ? 'special-good' : 'special-bad') : ''} ${isTarget ? 'cell-target' : ''} ${isFlash ? 'cell-flash' : ''} ${onPath ? 'cell-path' : ''} ${isPreviewDest ? 'cell-preview-dest' : ''}`}
                title={special?.title}
              >
                {home && !isCorner && <div className="absolute inset-[20%] rounded-full opacity-75" style={{ border: `3px dashed ${home}` }} aria-hidden />}
                {home && isCorner && <div className="absolute inset-0 opacity-70" style={{ boxShadow: `inset 0 0 0 4px ${home}` }} aria-hidden />}
                {special && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center stencil">
                    <span className="text-[clamp(13px,4vw,30px)]">{special.num}</span>
                    <span className="text-[clamp(5px,1.25vw,9px)] text-center px-0.5">{special.word}</span>
                  </div>
                )}
                <span className={`absolute left-[4%] top-[2%] text-[clamp(6px,1.3vw,9px)] font-bold ${dark ? 'text-amber-100/35' : 'text-stone-800/35'}`}>{cell}</span>
                {piece && (
                  <button
                    key={piece.moving ? `${piece.pieceId}@${cell}` : piece.pieceId}
                    type="button"
                    data-testid={`piece-${piece.pieceId}`}
                    disabled={!isSel}
                    onClick={() => isSel && onPieceClick(piece.pieceId)}
                    onMouseEnter={() => isSel && onPieceHover(piece.pieceId)}
                    onMouseLeave={() => isSel && onPieceHover(null)}
                    onFocus={() => isSel && onPieceHover(piece.pieceId)}
                    onBlur={() => isSel && onPieceHover(null)}
                    onTouchStart={() => isSel && onPieceHover(piece.pieceId)}
                    className={`piece absolute inset-[6%] flex items-center justify-center ${isSel ? 'piece-selectable' : 'cursor-default'} ${piece.moving ? 'piece-hop' : captureCell === cell ? 'piece-captured' : 'piece-enter'}`}
                    aria-label={`Фигура ${piece.index} на ${cell}${piece.lapDone ? ', круг пройден' : ''}`}
                    title={piece.lapDone ? (piece.onFinish ? 'На финишной диагонали' : 'Полный круг пройден: может идти на диагональ') : undefined}
                    style={{ ['--pc' as string]: piece.color }}
                  >
                    <PieceGlyph color={piece.color} glyph={piece.glyph} index={piece.index} lapDone={piece.lapDone} />
                  </button>
                )}
              </div>
            );
            if (file === 0) return [<Label key={`l${rank}`} text={String(rank)} />, cellEl];
            if (file === 7) return [cellEl, <Label key={`r${rank}`} text={String(rank)} />];
            return cellEl;
          })}
          <Corner />
          {FILES.map((f) => <Label key={`b${f}`} text={f} />)}
          <Corner />
        </div>
        {previewLine && (
          <svg className="arrow-overlay p-1.5 sm:p-2.5" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden data-testid="preview-path">
            <path d={previewLine} className="preview-path" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {dice.show && <DiceThrow value={dice.value} rolling={dice.rolling} />}
        {arrowPath && (
          <svg className="arrow-overlay p-1.5 sm:p-2.5" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden data-testid="arrow">
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L6,3 L0,6 z" fill={arrow!.kind === 'autoForward' ? 'var(--good)' : 'var(--bad)'} />
              </marker>
            </defs>
            <path d={arrowPath} className="arrow-path" stroke={arrow!.kind === 'autoForward' ? 'var(--good)' : 'var(--bad)'} markerEnd="url(#arrowhead)" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
      </div>
    </div>
  );
}

/** Ломаная через клетки пути (по периметру стрелка идёт вдоль края доски). */
function buildArrowPath(arrow: ArrowOverlay, state: GameState): string {
  const per = state.config.perimeter;
  const a = per.indexOf(arrow.from);
  const b = per.indexOf(arrow.to);
  if (a < 0 || b < 0) {
    const p = cellCenter(arrow.from);
    const q = cellCenter(arrow.to);
    return `M${p.x},${p.y} L${q.x},${q.y}`;
  }
  const n = per.length;
  const dir = arrow.kind === 'autoForward' ? 1 : -1;
  const pts: { x: number; y: number }[] = [];
  for (let i = a; ; i = (i + dir + n) % n) {
    pts.push(cellCenter(per[i]!));
    if (i === b) break;
  }
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

function Label({ text }: { text: string }) {
  return <div className="board-label flex items-center justify-center text-[clamp(8px,1.6vw,12px)]">{text}</div>;
}
function Corner() {
  return <div />;
}

export function PieceGlyph({ color, glyph, index, size = 'board', lapDone = false }: { color: string; glyph: string; index: number; size?: 'board' | 'small'; lapDone?: boolean }) {
  const cls = size === 'board' ? 'text-[clamp(18px,6.4vw,48px)]' : 'text-[30px]';
  return (
    <span className={`piece relative inline-flex items-center justify-center w-full h-full leading-none ${lapDone ? 'piece-lap' : ''} ${size === 'small' ? 'piece-small' : ''}`} style={{ ['--pc' as string]: color }}>
      <span className="piece-base" aria-hidden />
      <PieceShape kind={glyph} color={color} className={`piece-shape ${size === 'board' ? 'piece-shape-board' : 'piece-shape-small'}`} />
      <span className={`piece-glyph ${cls} font-black hidden`}>{glyphFor(glyph)}</span>
      <span className="piece-badge">{index}</span>
      {lapDone && <span className="piece-lap-mark" aria-hidden>✓</span>}
    </span>
  );
}

/** Большой кубик, падающий на доску и кувыркающийся, как настоящий. */
const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const ROTATION: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(-90deg) rotateY(0deg)',
  3: 'rotateX(0deg) rotateY(-90deg)',
  4: 'rotateX(0deg) rotateY(90deg)',
  5: 'rotateX(90deg) rotateY(0deg)',
  6: 'rotateX(180deg) rotateY(0deg)',
};
const FACE_TRANSFORM: Record<number, string> = { 1: 'rotateY(0deg)', 6: 'rotateY(180deg)', 2: 'rotateX(90deg)', 5: 'rotateX(-90deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)' };

export function DiceThrow({ value, rolling }: { value: number | null; rolling: boolean }) {
  const v = value ?? 6;
  return (
    <div className={`dice-throw ${rolling ? 'throwing' : 'landed'}`} data-testid="dice-throw" aria-hidden>
      <div className="dice-throw-shadow" />
      <div className="dice-throw-cube" style={{ transform: rolling ? undefined : ROTATION[v] }}>
        {[1, 2, 3, 4, 5, 6].map((f) => (
          <div key={f} className="dice-face" style={{ transform: `${FACE_TRANSFORM[f]} translateZ(var(--half))` }}>
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className={PIPS[f]!.includes(i) ? 'pip' : ''} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
