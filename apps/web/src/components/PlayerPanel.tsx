import type { GameState, LegalAction, PlayerState } from '@blokha/game-engine';
import { glyphFor } from '../game/pieceSets';
import { PieceGlyph } from './Board';
import type { AnimOverrides } from '../game/useLocalGame';

interface Props {
  state: GameState;
  player: PlayerState;
  active: boolean;
  spawnAction: LegalAction | undefined;
  onSpawn: (actionId: string) => void;
  overrides: AnimOverrides;
}

export function PlayerPanel({ state, player, active, spawnAction, onSpawn, overrides }: Props) {
  const reserve = player.pieces.filter((p) => p.progress === null || overrides[p.id] === ('__reserve' as string));
  const finished = player.pieces.filter((p) => p.progress !== null && p.progress >= state.config.perimeter.length).length;
  const glyph = glyphFor(player.pieceSet);
  return (
    <div
      data-testid={`player-${player.id}`}
      className={`rounded-xl p-2.5 sm:p-3 bg-stone-800/70 border-2 transition-all ${active ? 'border-yellow-400 shadow-[0_0_18px_rgba(250,204,21,0.35)]' : 'border-stone-700'}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: player.color }} />
        <span className="font-black truncate">{player.nickname}</span>
        <span className="text-xs text-stone-400 ml-auto">угол {player.corner}</span>
      </div>
      <div className="mt-2 flex items-center gap-1 min-h-[36px]">
        <span className="text-xs text-stone-400 mr-1">Резерв:</span>
        {reserve.length === 0 && <span className="text-xs text-stone-500">пусто</span>}
        {reserve.map((p, i) => {
          const canSpawn = active && spawnAction && spawnAction.pieceId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              data-testid={`reserve-${p.id}`}
              disabled={!canSpawn}
              onClick={() => canSpawn && onSpawn(spawnAction.id)}
              className={`piece ${canSpawn ? 'piece-selectable' : 'opacity-80'} px-0.5`}
              aria-label={`Фигура в резерве ${i + 1}`}
            >
              <PieceGlyph color={player.color} glyph={glyph} index={player.pieces.indexOf(p) + 1} size="small" />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        <span className="text-stone-300">Финиш: {finished}/4</span>
        {player.bonusRollsRemaining > 0 && <span className="text-emerald-300 font-bold">+{player.bonusRollsRemaining} бросков</span>}
        {player.skippedTurnsRemaining > 0 && <span className="text-rose-300 font-bold">пропуск ×{player.skippedTurnsRemaining}</span>}
        {state.winnerId === player.id && <span className="text-yellow-300 font-black">🏆 победа</span>}
      </div>
    </div>
  );
}
