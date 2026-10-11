import { currentPlayer, type Cell } from '@blokha/game-engine';
import { useEffect, useRef } from 'react';
import type { LocalGame } from '../game/useLocalGame';
import { Board } from './Board';
import { Dice } from './Dice';
import { PlayerPanel } from './PlayerPanel';

const BLOCK_TEXT: Record<string, string> = {
  inReserveNeedsSix: 'нужна шестёрка',
  locked: 'уже на финише',
  overshootsFinish: 'перелёт финиша',
  pathBlocked: 'путь занят',
  destinationOwnPiece: 'на клетке своя фигура',
  cornerOccupiedByOwnPiece: 'на углу своя фигура',
};

interface Props {
  game: LocalGame;
  theme: 'wood' | 'modern';
  onToggleTheme: () => void;
  onNewGame: () => void;
}

export function GameScreen({ game, theme, onToggleTheme, onNewGame }: Props) {
  const { state } = game;
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [game.log.length]);
  if (!state) return null;

  const cur = currentPlayer(state);
  const finished = state.phase === 'finished';
  const canRoll = state.phase === 'awaitingRoll' && !game.animating && !game.rolling && !finished;
  const choosing = state.phase === 'awaitingAction' && !game.animating;
  const spawnAction = choosing ? state.legalActions.find((a) => a.type === 'spawn') : undefined;
  const moveActions = choosing ? state.legalActions.filter((a) => a.type === 'move') : [];
  const targets: Cell[] = choosing ? state.legalActions.map((a) => a.to) : [];
  const winner = finished ? state.players.find((p) => p.id === state.winnerId) : undefined;
  const blockedHints = choosing
    ? state.blockedPieces
        .filter((b) => b.reason !== 'inReserveNeedsSix' && b.reason !== 'locked')
        .map((b) => `фигура ${cur.pieces.findIndex((p) => p.id === b.pieceId) + 1}: ${BLOCK_TEXT[b.reason] ?? b.reason}${b.cell ? ` (${b.cell})` : ''}`)
    : [];

  const onPieceClick = (pieceId: string) => {
    const a = moveActions.find((m) => m.pieceId === pieceId);
    if (a) game.choose(a.id);
  };

  return (
    <div className="min-h-full flex flex-col lg:flex-row gap-3 p-2 sm:p-4 max-w-6xl mx-auto">
      <div className="flex-1 flex flex-col items-center gap-3">
        <div className="w-full max-w-[min(92vw,640px)] flex items-center justify-between text-sm">
          <button type="button" onClick={onNewGame} className="text-stone-300 hover:text-white">← Новая партия</button>
          <button type="button" onClick={onToggleTheme} className="text-stone-300 hover:text-white" data-testid="toggle-theme">
            Тема: {theme === 'wood' ? 'Classic Wood' : 'Modern'}
          </button>
        </div>
        <Board
          state={state}
          overrides={game.overrides}
          theme={theme}
          selectableActions={moveActions}
          onPieceClick={onPieceClick}
          flashCell={game.flashCell}
          highlightTargets={targets}
        />
        <div className="w-full max-w-[min(92vw,640px)] rounded-2xl bg-stone-800/80 p-3 flex items-center gap-3 sm:gap-4">
          <Dice value={game.lastRoll} rolling={game.rolling} />
          <div className="flex-1 min-w-0">
            {finished && winner ? (
              <div className="font-black text-yellow-300 text-lg" data-testid="status">🏆 Победил {winner.nickname}!</div>
            ) : (
              <div data-testid="status" className="font-bold">
                <span className="inline-block w-3 h-3 rounded-full mr-2 align-middle" style={{ background: cur.color }} />
                {cur.nickname}
                {state.phase === 'awaitingRoll' && (
                  <span className="text-stone-300 font-medium"> — {state.freeRollAvailable ? 'бросайте кубик' : `бонусный бросок (осталось ${cur.bonusRollsRemaining})`}</span>
                )}
                {choosing && <span className="text-stone-300 font-medium"> — выпало {state.currentRoll}, выберите фигуру</span>}
                {game.animating && <span className="text-stone-400 font-medium"> …</span>}
              </div>
            )}
            {choosing && blockedHints.length > 0 && <div className="text-xs text-stone-400 mt-1 truncate">Недоступно: {blockedHints.join('; ')}</div>}
            {choosing && spawnAction && <div className="text-xs text-emerald-300 mt-1">Можно выставить фигуру из резерва (нажмите на неё в панели игрока)</div>}
          </div>
          {!finished && (
            <button
              type="button"
              data-testid="roll"
              disabled={!canRoll}
              onClick={game.roll}
              className="px-4 sm:px-6 py-3 rounded-xl bg-yellow-400 text-stone-900 font-black text-base sm:text-lg disabled:opacity-40 shadow-[0_5px_0_#b08900] active:translate-y-0.5 whitespace-nowrap"
            >
              Бросить
            </button>
          )}
          {finished && (
            <button type="button" onClick={onNewGame} className="px-4 py-3 rounded-xl bg-yellow-400 text-stone-900 font-black">Новая партия</button>
          )}
        </div>
      </div>

      <div className="lg:w-80 flex flex-col gap-3 lg:max-h-[calc(100vh-2rem)] lg:sticky lg:top-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
          {state.players.map((p) => (
            <PlayerPanel
              key={p.id}
              state={state}
              player={p}
              active={p.id === cur.id && !finished}
              spawnAction={p.id === cur.id ? spawnAction : undefined}
              onSpawn={(id) => game.choose(id)}
              overrides={game.overrides}
            />
          ))}
        </div>
        <div ref={logRef} className="rounded-xl bg-stone-800/60 p-3 text-sm h-40 lg:h-auto lg:flex-1 lg:min-h-0 overflow-y-auto space-y-1" data-testid="log">
          {game.log.map((l) => (
            <div key={l.id} className={l.tone === 'good' ? 'text-emerald-300' : l.tone === 'bad' ? 'text-rose-300' : l.tone === 'win' ? 'text-yellow-300 font-black' : 'text-stone-300'}>
              {l.text}
            </div>
          ))}
        </div>
      </div>

      {finished && winner && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20" data-testid="victory">
          <div className="bg-stone-800 rounded-3xl p-6 sm:p-8 text-center max-w-sm w-full animate-pop shadow-2xl border-2 border-yellow-400">
            <div className="text-6xl">🏆</div>
            <div className="text-2xl font-black mt-2" style={{ color: winner.color }}>{winner.nickname}</div>
            <div className="text-stone-300 mt-1">заполнил всю диагональ от {winner.corner}!</div>
            <button type="button" onClick={onNewGame} className="mt-5 w-full py-3 rounded-xl bg-yellow-400 text-stone-900 font-black">Новая партия</button>
          </div>
        </div>
      )}
    </div>
  );
}
