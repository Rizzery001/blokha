import {
  applyCommand,
  chooseBotAction,
  createCryptoDiceRoller,
  currentPlayer,
  type DiceRoller,
  type PlayerSetup,
} from '@blokha/game-engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FAST, usePresenter, type Presenter } from './usePresenter';

export type { AnimOverrides, LogEntry } from './usePresenter';

export interface LocalPlayerSetup extends PlayerSetup {
  isBot?: boolean;
}

/** Единый интерфейс управления партией для экрана игры (локальная и онлайн). */
export interface GameController extends Presenter {
  /** id игрока за этим устройством; null — все игроки локальные */
  myPlayerId: string | null;
  botIds: Set<string>;
  disconnectedIds?: Set<string>;
  roll: () => void;
  choose: (actionId: string) => void;
  error: string | null;
}

export interface LocalGame extends GameController {
  start: (players: LocalPlayerSetup[]) => void;
}

const BOT_DELAY_MS = FAST ? 5 : 700;

export function useLocalGame(dice?: DiceRoller): LocalGame {
  const presenter = usePresenter();
  const { stateRef, ingest, busy } = presenter;
  const diceRef = useRef<DiceRoller>(dice ?? createCryptoDiceRoller());
  const [botIds, setBotIds] = useState<Set<string>>(new Set());
  const pending = useRef(false);

  const start = useCallback(
    (players: LocalPlayerSetup[]) => {
      setBotIds(new Set(players.filter((p) => p.isBot).map((p) => p.id)));
      presenter.startFresh(players.map(({ isBot, ...p }) => p));
    },
    [presenter],
  );

  const roll = useCallback(() => {
    const s = stateRef.current;
    if (!s || s.phase !== 'awaitingRoll' || pending.current) return;
    pending.current = true;
    const { state: next, events } = applyCommand(s, { type: 'roll', playerId: currentPlayer(s).id, value: diceRef.current() });
    void ingest(next, events).finally(() => {
      pending.current = false;
    });
  }, [ingest, stateRef]);

  const choose = useCallback(
    (actionId: string) => {
      const s = stateRef.current;
      if (!s || s.phase !== 'awaitingAction' || pending.current) return;
      pending.current = true;
      const { state: next, events } = applyCommand(s, { type: 'chooseAction', playerId: currentPlayer(s).id, actionId });
      void ingest(next, events).finally(() => {
        pending.current = false;
      });
    },
    [ingest, stateRef],
  );

  // Автоход роботов: после публикации состояния, если ходит робот — бросаем/выбираем с паузой.
  const state = presenter.state;
  useEffect(() => {
    if (!state || state.phase === 'finished' || busy) return;
    const cur = currentPlayer(state);
    if (!botIds.has(cur.id)) return;
    const t = setTimeout(() => {
      const s = stateRef.current;
      if (!s || s !== state) return;
      if (s.phase === 'awaitingRoll') roll();
      else if (s.phase === 'awaitingAction') choose(chooseBotAction(s, cur.id).id);
    }, BOT_DELAY_MS);
    return () => clearTimeout(t);
  }, [state, busy, botIds, roll, choose, stateRef]);

  return { ...presenter, myPlayerId: null, botIds, roll, choose, start, error: null };
}
