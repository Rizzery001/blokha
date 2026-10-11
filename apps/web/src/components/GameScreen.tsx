import { currentPlayer, type Cell } from '@blokha/game-engine';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameController } from '../game/useLocalGame';
import { Board } from './Board';
import { Confetti } from './Confetti';
import { Dice } from './Dice';
import { PlayerPanel } from './PlayerPanel';
import { Toasts } from './Toasts';
import { useIsDesktop } from '../game/useMedia';
import { DICE_SETTLE_MS, FAST } from '../game/usePresenter';

const BLOCK_TEXT: Record<string, string> = {
  inReserveNeedsSix: 'нужна шестёрка',
  locked: 'уже на финише',
  overshootsFinish: 'перелёт финиша',
  pathBlocked: 'путь занят',
  destinationOwnPiece: 'на клетке своя фигура',
  cornerOccupiedByOwnPiece: 'на углу своя фигура',
};

interface Props {
  game: GameController;
  theme: 'wood' | 'modern';
  onToggleTheme: () => void;
  onNewGame: () => void;
  newGameLabel?: string;
  banner?: ReactNode;
  canStartNew?: boolean;
}

export function GameScreen({ game, theme, onToggleTheme, onNewGame, newGameLabel = '← Новая партия', banner, canStartNew = true }: Props) {
  const { state } = game;
  const logRef = useRef<HTMLDivElement>(null);
  const [logOpen, setLogOpen] = useState(false);
  const desktop = useIsDesktop();
  const [diceShown, setDiceShown] = useState(false);
  useEffect(() => {
    if (game.rolling) {
      setDiceShown(true);
      return;
    }
    const t = setTimeout(() => setDiceShown(false), DICE_SETTLE_MS + 150);
    return () => clearTimeout(t);
  }, [game.rolling]);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [game.log.length, logOpen]);
  // Единственный легальный ход выполняется сам: игроку не нужно кликать, если выбора нет.
  const soleActionId =
    state && state.phase === 'awaitingAction' && state.legalActions.length === 1 && !game.animating && !game.rolling
      ? state.legalActions[0]!.id
      : null;
  const curId = state ? currentPlayer(state).id : null;
  const autoAllowed = !!state && curId !== null && !game.botIds.has(curId) && (game.myPlayerId === null || game.myPlayerId === curId);
  useEffect(() => {
    if (!soleActionId || !autoAllowed) return;
    const t = setTimeout(() => game.choose(soleActionId), FAST ? 0 : 450);
    return () => clearTimeout(t);
  }, [soleActionId, autoAllowed, game]);
  if (!state) return null;

  const cur = currentPlayer(state);
  const finished = state.phase === 'finished';
  const isBotTurn = game.botIds.has(cur.id);
  const myTurn = !isBotTurn && (game.myPlayerId === null || game.myPlayerId === cur.id);
  const canRoll = myTurn && state.phase === 'awaitingRoll' && !game.animating && !game.rolling && !finished;
  const choosing = myTurn && state.phase === 'awaitingAction' && !game.animating;
  const waitingOther = !myTurn && !finished && !game.animating;
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

  const statusText = finished && winner ? null : (
    <>
      <span className="inline-block w-3 h-3 rounded-full mr-2 align-middle" style={{ background: cur.color }} />
      {cur.nickname}
      {isBotTurn && <span className="text-sky-300 font-medium"> 🤖 думает…</span>}
      {waitingOther && !isBotTurn && <span className="font-medium" style={{ color: 'var(--muted)' }}> — ждём ход{state.phase === 'awaitingAction' ? ` (выпало ${state.currentRoll})` : ''}</span>}
      {myTurn && state.phase === 'awaitingRoll' && !game.animating && (
        <span className="font-medium" style={{ color: 'var(--muted)' }}> — {state.freeRollAvailable ? 'бросайте кубик' : `бонусный бросок (ещё ${cur.bonusRollsRemaining})`}</span>
      )}
      {choosing && <span className="font-medium" style={{ color: 'var(--muted)' }}> — выпало {state.currentRoll}, выберите фигуру</span>}
      {game.animating && <span className="font-medium" style={{ color: 'var(--muted)' }}> …</span>}
    </>
  );

  return (
    <div className={`theme-${theme} app-bg min-h-full`}>
      <Toasts notices={game.notices} />
      <div className="min-h-full flex flex-col lg:flex-row gap-3 px-2 sm:px-4 py-2 sm:py-4 max-w-6xl mx-auto">
        <div className="flex-1 flex flex-col items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-full max-w-[min(94vw,640px)] flex items-center justify-between text-sm">
            <button type="button" onClick={onNewGame} className="hover:underline" style={{ color: 'var(--muted)' }}>{newGameLabel}</button>
            <button type="button" onClick={onToggleTheme} className="hover:underline" style={{ color: 'var(--muted)' }} data-testid="toggle-theme">
              Тема: {theme === 'wood' ? 'Classic Wood' : 'Modern'}
            </button>
          </div>
          {banner}
          {game.error && <div className="w-full max-w-[min(94vw,640px)] rounded-lg bg-rose-900/70 text-rose-100 text-sm px-3 py-2">{game.error}</div>}

          {/* компактная полоса игроков на мобильном */}
          {!desktop && <div className="w-full max-w-[min(94vw,640px)] flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1" data-testid="player-strip">
            {state.players.map((p) => (
              <PlayerPanel
                key={p.id}
                compact
                state={state}
                player={p}
                active={p.id === cur.id && !finished}
                spawnAction={p.id === cur.id ? spawnAction : undefined}
                onSpawn={(id) => game.choose(id)}
                overrides={game.overrides}
                isBot={game.botIds.has(p.id)}
                isMe={game.myPlayerId === p.id}
                disconnected={game.disconnectedIds?.has(p.id) ?? false}
              />
            ))}
          </div>}

          <Board
            state={state}
            overrides={game.overrides}
            theme={theme}
            selectableActions={moveActions}
            onPieceClick={onPieceClick}
            flashCell={game.flashCell}
            highlightTargets={targets}
            arrow={game.arrow}
            captureCell={game.captureCell}
            dice={{ value: game.lastRoll, rolling: game.rolling, show: diceShown }}
          />

          <div className="panel w-full max-w-[min(94vw,640px)] rounded-2xl p-2.5 sm:p-3 flex items-center gap-3 sm:gap-4">
            <Dice value={game.lastRoll} rolling={game.rolling} />
            <div className="flex-1 min-w-0">
              {finished && winner ? (
                <div className="font-black text-lg" style={{ color: 'var(--accent)' }} data-testid="status">🏆 Победил {winner.nickname}!</div>
              ) : (
                <div data-testid="status" className="font-bold leading-snug">{statusText}</div>
              )}
              {choosing && blockedHints.length > 0 && <div className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--muted)' }}>Недоступно: {blockedHints.join('; ')}</div>}
              {choosing && spawnAction && <div className="text-xs mt-1" style={{ color: 'var(--good)' }}>Можно выставить фигуру из резерва — нажмите на неё в карточке игрока</div>}
            </div>
            {!finished && (
              <button type="button" data-testid="roll" disabled={!canRoll} onClick={game.roll} className="btn-primary px-4 sm:px-6 py-3 rounded-xl font-black text-base sm:text-lg whitespace-nowrap transition-transform">
                Бросить
              </button>
            )}
            {finished && canStartNew && (
              <button type="button" onClick={onNewGame} className="btn-primary px-4 py-3 rounded-xl font-black">Новая партия</button>
            )}
          </div>

          {/* журнал на мобильном — сворачиваемый */}
          {!desktop && <div className="w-full max-w-[min(94vw,640px)]">
            <button type="button" data-testid="log-toggle" onClick={() => setLogOpen((v) => !v)} className="text-xs" style={{ color: 'var(--muted)' }}>
              {logOpen ? '▾ Скрыть журнал' : `▸ Журнал партии (${game.log.length})`}
            </button>
            {logOpen && <LogList logRef={logRef} log={game.log} className="mt-1 h-40" />}
          </div>}
        </div>

        {desktop && <div className="flex lg:w-80 flex-col gap-3 lg:max-h-[calc(100vh-2rem)] lg:sticky lg:top-4">
          <div className="grid grid-cols-1 gap-2">
            {state.players.map((p) => (
              <PlayerPanel
                key={p.id}
                state={state}
                player={p}
                active={p.id === cur.id && !finished}
                spawnAction={p.id === cur.id ? spawnAction : undefined}
                onSpawn={(id) => game.choose(id)}
                overrides={game.overrides}
                isBot={game.botIds.has(p.id)}
                isMe={game.myPlayerId === p.id}
                disconnected={game.disconnectedIds?.has(p.id) ?? false}
              />
            ))}
          </div>
          <LogList logRef={logRef} log={game.log} className="lg:flex-1 lg:min-h-0" />
        </div>}

        {finished && winner && (
          <>
            <Confetti color={winner.color} />
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20" data-testid="victory">
              <div className="panel rounded-3xl p-6 sm:p-8 text-center max-w-sm w-full animate-pop shadow-2xl" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
                <div className="text-6xl">🏆</div>
                <div className="text-2xl font-black mt-2" style={{ color: winner.color }}>{winner.nickname}</div>
                <div className="mt-1" style={{ color: 'var(--muted)' }}>заполнил всю свою финишную диагональ!</div>
                {canStartNew ? (
                  <button type="button" onClick={onNewGame} className="btn-primary mt-5 w-full py-3 rounded-xl font-black">Новая партия</button>
                ) : (
                  <div className="mt-5 text-sm" style={{ color: 'var(--muted)' }}>Хозяин комнаты может начать новую партию</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LogList({ logRef, log, className }: { logRef: React.RefObject<HTMLDivElement>; log: GameController['log']; className?: string }) {
  return (
    <div ref={logRef} className={`panel rounded-xl p-3 text-sm overflow-y-auto space-y-1 ${className ?? ''}`} data-testid="log">
      {log.map((l) => (
        <div key={l.id} style={{ color: l.tone === 'good' ? 'var(--good)' : l.tone === 'bad' ? 'var(--bad)' : l.tone === 'win' ? 'var(--accent)' : 'var(--fg)' }} className={l.tone === 'win' ? 'font-black' : ''}>
          {l.text}
        </div>
      ))}
    </div>
  );
}
