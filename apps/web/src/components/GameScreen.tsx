import { currentPlayer, type Cell, type LegalAction } from '@blokha/game-engine';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameController } from '../game/useLocalGame';
import { useIsDesktop } from '../game/useMedia';
import { DICE_SETTLE_MS, FAST } from '../game/usePresenter';
import { isMuted, setMuted, sfx, unlockAudio } from '../game/sound';
import { Board } from './Board';
import { Confetti } from './Confetti';
import { Dice } from './Dice';
import { PlayerPanel } from './PlayerPanel';
import { ReactionBar } from './ReactionBar';
import { ResultsPanel } from './ResultsPanel';
import { Toasts } from './Toasts';

const BLOCK_TEXT: Record<string, string> = {
  inReserveNeedsSix: 'нужна шестёрка',
  locked: 'уже на финише',
  overshootsFinish: 'перелёт финиша',
  pathBlocked: 'путь занят',
  destinationOwnPiece: 'на клетке своя фигура',
  cornerOccupiedByOwnPiece: 'на углу своя фигура',
};

const TURN_REMINDER_MS = 45_000;

interface Props {
  game: GameController;
  theme: 'wood' | 'modern';
  onToggleTheme: () => void;
  onNewGame: () => void;
  newGameLabel?: string;
  banner?: ReactNode;
  canStartNew?: boolean;
  series?: Record<string, number>;
  gamesPlayed?: number;
}

/** Что произойдёт, если выбрать этот ход (для подсказки). */
function describeAction(game: GameController, a: LegalAction): string {
  const state = game.state!;
  const name = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? id;
  const parts: string[] = [];
  if (a.type === 'spawn') parts.push(`выставить фигуру на ${a.to}`);
  else parts.push(`${a.from} → ${a.to}`);
  if (a.captures) parts.push(`выбьет фигуру: ${name(a.captures.playerId)}`);
  const sc = state.config.specialCells[a.to];
  if (sc && a.type === 'move') {
    if (sc.type === 'turnBalance') parts.push(sc.rolls > 0 ? `+${sc.rolls} доп. ${sc.rolls === 1 ? 'бросок' : 'броска'}` : `пропуск ${-sc.rolls}`);
    else parts.push(sc.steps > 0 ? `затем ещё ${sc.steps} вперёд (если путь свободен)` : `затем ${-sc.steps} назад (если путь свободен)`);
  }
  const lap = state.config.perimeter.length;
  if (a.type === 'move') {
    if (a.toProgress === lap) parts.push('полный круг');
    else if (a.toProgress === lap + state.config.homes[currentPlayer(state).corner]!.length - 1) parts.push('финиш!');
    else if (a.toProgress > lap) parts.push('на диагональ');
  }
  return parts.join(' · ');
}

export function GameScreen({ game, theme, onToggleTheme, onNewGame, newGameLabel = '← Новая партия', banner, canStartNew = true, series = {}, gamesPlayed = 0 }: Props) {
  const { state } = game;
  const logRef = useRef<HTMLDivElement>(null);
  const [logOpen, setLogOpen] = useState(false);
  const desktop = useIsDesktop();
  const [diceShown, setDiceShown] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [hoverPiece, setHoverPiece] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(true);
  const [reminder, setReminder] = useState(false);
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

  // Напоминание, если игрок долго не ходит (без автохода за него).
  const phaseKey = state ? `${state.version}:${state.phase}` : '';
  const myTurnNow = !!state && curId !== null && !game.botIds.has(curId) && (game.myPlayerId === null || game.myPlayerId === curId) && state.phase !== 'finished';
  useEffect(() => {
    setReminder(false);
    if (!myTurnNow || FAST) return;
    const t = setTimeout(() => {
      setReminder(true);
      sfx.reminder();
    }, TURN_REMINDER_MS);
    return () => clearTimeout(t);
  }, [phaseKey, myTurnNow]);
  useEffect(() => {
    if (state?.phase === 'finished') setShowResults(true);
  }, [state?.phase]);

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
  const preview = choosing && hoverPiece ? state.legalActions.find((a) => a.pieceId === hoverPiece) ?? null : null;
  const blockedHints = choosing
    ? state.blockedPieces
        .filter((b) => b.reason !== 'inReserveNeedsSix' && b.reason !== 'locked')
        .map((b) => `фигура ${cur.pieces.findIndex((p) => p.id === b.pieceId) + 1}: ${BLOCK_TEXT[b.reason] ?? b.reason}${b.cell ? ` (${b.cell})` : ''}`)
    : [];

  const onPieceClick = (pieceId: string) => {
    const a = moveActions.find((m) => m.pieceId === pieceId);
    if (a) {
      setHoverPiece(null);
      game.choose(a.id);
    }
  };
  const toggleMute = () => {
    const v = !muted;
    setMuted(v);
    setMutedState(v);
    if (!v) sfx.click();
  };
  const onRoll = () => {
    unlockAudio();
    game.roll();
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
      {choosing && !preview && state.legalActions.length > 1 && <span className="font-medium" style={{ color: 'var(--muted)' }}> — выпало {state.currentRoll}, выберите фигуру</span>}
      {choosing && state.legalActions.length === 1 && <span className="font-medium" style={{ color: 'var(--muted)' }}> — выпало {state.currentRoll}, ход единственный</span>}
      {choosing && preview && <span className="font-medium" style={{ color: 'var(--select)' }}> — {describeAction(game, preview)}</span>}
      {game.animating && <span className="font-medium" style={{ color: 'var(--muted)' }}> …</span>}
      {reminder && myTurn && <span className="font-medium text-amber-300"> ⏰ ваш ход!</span>}
    </>
  );

  const reactionsByPlayer = new Map<string, { id: number; emoji: string }[]>();
  for (const r of game.reactions ?? []) reactionsByPlayer.set(r.playerId, [...(reactionsByPlayer.get(r.playerId) ?? []), r]);

  const panel = (p: (typeof state.players)[number], compact: boolean) => (
    <div key={p.id} className="relative">
      <PlayerPanel
        compact={compact}
        state={state}
        player={p}
        active={p.id === cur.id && !finished}
        spawnAction={p.id === cur.id ? spawnAction : undefined}
        onSpawn={(id) => game.choose(id)}
        overrides={game.overrides}
        isBot={game.botIds.has(p.id)}
        isMe={game.myPlayerId === p.id}
        disconnected={game.disconnectedIds?.has(p.id) ?? false}
        seriesWins={series[p.id] ?? 0}
        achievements={(game.achievements[p.id] ?? []).map((a) => a.icon).join('')}
      />
      {(reactionsByPlayer.get(p.id) ?? []).map((r) => (
        <span key={r.id} className="reaction-float right-2 top-0">{r.emoji}</span>
      ))}
    </div>
  );

  return (
    <div className={`theme-${theme} app-bg min-h-full`}>
      <Toasts notices={game.notices} />
      <div className="min-h-full flex flex-col lg:flex-row gap-3 px-2 sm:px-4 py-2 sm:py-4 max-w-6xl mx-auto">
        <div className="flex-1 flex flex-col items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-full max-w-[min(94vw,640px)] flex items-center justify-between text-sm gap-2">
            <button type="button" onClick={onNewGame} className="hover:underline" style={{ color: 'var(--muted)' }}>{newGameLabel}</button>
            <div className="flex items-center gap-3">
              <button type="button" onClick={toggleMute} data-testid="toggle-sound" className="hover:underline" style={{ color: 'var(--muted)' }} aria-label={muted ? 'Включить звук' : 'Выключить звук'}>
                {muted ? '🔇 Звук выкл' : '🔊 Звук'}
              </button>
              <button type="button" onClick={onToggleTheme} className="hover:underline" style={{ color: 'var(--muted)' }} data-testid="toggle-theme">
                {theme === 'wood' ? 'Classic Wood' : 'Modern'}
              </button>
            </div>
          </div>
          {banner}
          {game.error && <div className="w-full max-w-[min(94vw,640px)] rounded-lg bg-rose-900/70 text-rose-100 text-sm px-3 py-2">{game.error}</div>}

          {!desktop && (
            <div className="w-full max-w-[min(94vw,640px)] flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1" data-testid="player-strip">
              {state.players.map((p) => panel(p, true))}
            </div>
          )}

          <Board
            state={state}
            overrides={game.overrides}
            theme={theme}
            selectableActions={moveActions}
            onPieceClick={onPieceClick}
            onPieceHover={setHoverPiece}
            preview={preview}
            flashCell={game.flashCell}
            highlightTargets={targets}
            arrow={game.arrow}
            captureCell={game.captureCell}
            dice={{ value: game.lastRoll, rolling: game.rolling, show: diceShown }}
            shake={game.shake}
          />

          <div className="panel w-full max-w-[min(94vw,640px)] rounded-2xl p-2.5 sm:p-3 flex items-center gap-3 sm:gap-4">
            <Dice value={game.lastRoll} rolling={game.rolling} />
            <div className="flex-1 min-w-0">
              {finished && winner ? (
                <div className="font-black text-lg" style={{ color: 'var(--accent)' }} data-testid="status">🏆 Победил {winner.nickname}!</div>
              ) : (
                <div data-testid="status" className="font-bold leading-snug">{statusText}</div>
              )}
              {choosing && !preview && blockedHints.length > 0 && <div className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--muted)' }}>Недоступно: {blockedHints.join('; ')}</div>}
              {choosing && spawnAction && !preview && <div className="text-xs mt-1" style={{ color: 'var(--good)' }}>Можно выставить фигуру из резерва — нажмите на неё в карточке игрока</div>}
            </div>
            {!finished && (
              <button type="button" data-testid="roll" disabled={!canRoll} onClick={onRoll} className={`btn-primary px-4 sm:px-6 py-3 rounded-xl font-black text-base sm:text-lg whitespace-nowrap transition-transform ${canRoll && reminder ? 'animate-pulse' : ''}`}>
                Бросить
              </button>
            )}
            {finished && canStartNew && (
              <button type="button" onClick={onNewGame} className="btn-primary px-4 py-3 rounded-xl font-black">Новая партия</button>
            )}
          </div>

          {game.sendReaction && (
            <div className="w-full max-w-[min(94vw,640px)]">
              <ReactionBar onSend={(e) => game.sendReaction!(e)} />
            </div>
          )}

          {!desktop && (
            <div className="w-full max-w-[min(94vw,640px)]">
              <button type="button" data-testid="log-toggle" onClick={() => setLogOpen((v) => !v)} className="text-xs" style={{ color: 'var(--muted)' }}>
                {logOpen ? '▾ Скрыть журнал' : `▸ Журнал партии (${game.log.length})`}
              </button>
              {logOpen && <LogList logRef={logRef} log={game.log} className="mt-1 h-40" />}
            </div>
          )}
        </div>

        {desktop && (
          <div className="flex lg:w-80 flex-col gap-3 lg:max-h-[calc(100vh-2rem)] lg:sticky lg:top-4">
            <div className="grid grid-cols-1 gap-2">{state.players.map((p) => panel(p, false))}</div>
            <LogList logRef={logRef} log={game.log} className="lg:flex-1 lg:min-h-0" />
          </div>
        )}

        {finished && winner && showResults && (
          <>
            <Confetti color={winner.color} />
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20" data-testid="victory">
              <div className="panel rounded-3xl p-5 sm:p-7 text-center max-w-lg w-full animate-pop shadow-2xl max-h-[92vh] overflow-y-auto" style={{ borderColor: 'var(--accent)', borderWidth: 2 }}>
                <div className="text-6xl">🏆</div>
                <div className="text-2xl font-black mt-2" style={{ color: winner.color }}>{winner.nickname}</div>
                <div className="mt-1" style={{ color: 'var(--muted)' }}>заполнил всю свою финишную диагональ!</div>
                <div className="mt-4">
                  <ResultsPanel state={state} achievements={game.achievements} series={series} gamesPlayed={gamesPlayed} />
                </div>
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => setShowResults(false)} className="btn-secondary flex-1 py-3 rounded-xl font-bold">Посмотреть доску</button>
                  {canStartNew ? (
                    <button type="button" onClick={onNewGame} className="btn-primary flex-1 py-3 rounded-xl font-black">Новая партия</button>
                  ) : (
                    <div className="flex-1 text-sm self-center" style={{ color: 'var(--muted)' }}>Хозяин комнаты может начать новую партию</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
        {finished && winner && !showResults && (
          <button type="button" onClick={() => setShowResults(true)} className="fixed bottom-4 right-4 z-20 btn-primary px-4 py-2 rounded-xl font-bold shadow-xl">Итоги партии</button>
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
