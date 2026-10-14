import type { GameState, LegalAction, PlayerState } from '@blokha/game-engine';
import { PieceGlyph } from './Board';
import { CornerIcon } from './CornerIcon';
import { Avatar } from './Avatar';
import { cornerName, cornerTitle } from '../game/pieceSets';
import type { AnimOverrides } from '../game/useLocalGame';

interface Props {
  state: GameState;
  player: PlayerState;
  active: boolean;
  spawnAction: LegalAction | undefined;
  onSpawn: (actionId: string) => void;
  overrides: AnimOverrides;
  isBot?: boolean;
  disconnected?: boolean;
  isMe?: boolean;
  compact?: boolean;
  seriesWins?: number;
  achievements?: string;
}

export function PlayerPanel({ state, player, active, spawnAction, onSpawn, overrides, isBot, disconnected, isMe, compact, seriesWins = 0, achievements = '' }: Props) {
  const reserve = player.pieces.filter((p) => p.progress === null || overrides[p.id] === ('__reserve' as string));
  const finished = player.pieces.filter((p) => p.progress !== null && p.progress >= state.config.perimeter.length).length;
  const glyph = player.pieceSet;
  const reserveButtons = reserve.map((p, i) => {
    const canSpawn = active && spawnAction && spawnAction.pieceId === p.id;
    return (
      <button
        key={p.id}
        type="button"
        data-testid={`reserve-${p.id}`}
        disabled={!canSpawn}
        onClick={() => canSpawn && onSpawn(spawnAction.id)}
        className={`${canSpawn ? 'piece-selectable' : 'opacity-85'} ${compact ? 'w-8 h-8' : 'w-10 h-10'} shrink-0`}
        aria-label={`Фигура в резерве ${i + 1}`}
      >
        <PieceGlyph color={player.color} glyph={glyph} index={player.pieces.indexOf(p) + 1} size="small" />
      </button>
    );
  });

  if (compact) {
    return (
      <div
        data-testid={`player-${player.id}`}
        className={`panel rounded-xl px-2 py-1.5 shrink-0 min-w-[120px] ${active ? 'active-ring' : ''}`}
        style={{ borderLeft: `4px solid ${player.color}` }}
      >
        <div className="flex items-center gap-1.5 text-xs font-black truncate">
          <Avatar emoji={player.avatar} color={player.color} size={22} active={active} />
          {player.nickname}
          {isMe && <span className="font-medium" style={{ color: 'var(--muted)' }}>(вы)</span>}
          {disconnected && <span className="text-[9px] uppercase text-rose-300">офлайн</span>}
          {seriesWins > 0 && <span className="ml-auto text-[10px] text-amber-300" title="Побед в серии">🏆{seriesWins}</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-1 min-h-[32px]">
          {reserveButtons}
          <span className="text-[10px] ml-auto whitespace-nowrap" style={{ color: 'var(--muted)' }}>{finished}/4 ✓</span>
        </div>
        {(player.bonusRollsRemaining > 0 || player.skippedTurnsRemaining > 0) && (
          <div className="text-[10px] font-bold">
            {player.bonusRollsRemaining > 0 && <span style={{ color: 'var(--good)' }}>+{player.bonusRollsRemaining} бр. </span>}
            {player.skippedTurnsRemaining > 0 && <span style={{ color: 'var(--bad)' }}>пропуск ×{player.skippedTurnsRemaining}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid={`player-${player.id}`}
      className={`panel rounded-xl p-3 transition-all ${active ? 'active-ring' : ''}`}
      style={{ borderLeft: `5px solid ${player.color}` }}
    >
      <div className="flex items-center gap-2">
        <Avatar emoji={player.avatar} color={player.color} size={34} active={active} />
        <span className="font-black truncate">{player.nickname}{isMe ? ' (вы)' : ''}</span>
        {disconnected && <span className="text-[10px] uppercase tracking-wide text-rose-300 bg-rose-900/50 px-1.5 rounded">офлайн</span>}
        {seriesWins > 0 && <span className="text-[11px] text-amber-300" title="Побед в серии">🏆 {seriesWins}</span>}
        <span className="text-xs ml-auto inline-flex items-center gap-1" style={{ color: 'var(--muted)' }} title={cornerTitle(player.corner)}><CornerIcon corner={player.corner} color={player.color} size={14} /> {cornerName(player.corner).toLowerCase()}</span>
      </div>
      <div className="mt-2 flex items-center gap-1 min-h-[36px]">
        <span className="text-xs mr-1" style={{ color: 'var(--muted)' }}>Резерв:</span>
        {reserve.length === 0 && <span className="text-xs" style={{ color: 'var(--muted)' }}>пусто</span>}
        {reserveButtons}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        <span style={{ color: 'var(--muted)' }}>Финиш: {finished}/4</span>
        {player.bonusRollsRemaining > 0 && <span className="font-bold" style={{ color: 'var(--good)' }}>+{player.bonusRollsRemaining} бросков</span>}
        {player.skippedTurnsRemaining > 0 && <span className="font-bold" style={{ color: 'var(--bad)' }}>пропуск ×{player.skippedTurnsRemaining}</span>}
        {state.winnerId === player.id && <span className="font-black" style={{ color: 'var(--accent)' }}>🏆 победа</span>}
        {achievements && <span title="Достижения в этой партии" className="tracking-wide">{achievements}</span>}
      </div>
    </div>
  );
}
