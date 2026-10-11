import type { DiceRoller } from '@blokha/game-engine';
import { normalizeRoomCode } from '@blokha/shared';
import { useEffect, useState } from 'react';
import { GameScreen } from './components/GameScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { OnlineScreen } from './components/OnlineScreen';
import { SetupScreen } from './components/SetupScreen';
import { useLocalGame } from './game/useLocalGame';
import { loadCredentials, useOnlineGame } from './game/useOnlineGame';

type Screen = 'home' | 'setup' | 'game' | 'online';
type Theme = 'wood' | 'modern';

function loadTheme(): Theme {
  try {
    return localStorage.getItem('blokha.theme') === 'modern' ? 'modern' : 'wood';
  } catch {
    return 'wood';
  }
}

function roomFromUrl(): string {
  try {
    return normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? '');
  } catch {
    return '';
  }
}

export function App({ dice }: { dice?: DiceRoller } = {}) {
  const [urlRoom] = useState(roomFromUrl);
  const [screen, setScreen] = useState<Screen>(() => (urlRoom || loadCredentials() ? 'online' : 'home'));
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const game = useLocalGame(dice);
  const online = useOnlineGame(screen === 'online');
  const toggleTheme = () => setTheme((t) => (t === 'wood' ? 'modern' : 'wood'));
  useEffect(() => {
    try {
      localStorage.setItem('blokha.theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  if (screen === 'online') {
    const room = online.room;
    if (room && room.status !== 'lobby' && online.state) {
      const offline = room.seats.filter((s) => !s.isBot && !s.connected);
      const banner =
        online.conn !== 'connected' ? (
          <div className="w-full max-w-[min(92vw,640px)] rounded-lg bg-rose-900/70 text-rose-100 text-sm px-3 py-2">Нет связи с сервером, переподключаемся…</div>
        ) : offline.length > 0 ? (
          <div className="w-full max-w-[min(92vw,640px)] rounded-lg bg-amber-900/60 text-amber-100 text-sm px-3 py-2">
            Ждём игрока: {offline.map((s) => s.nickname).join(', ')} (переподключение по той же ссылке)
          </div>
        ) : null;
      const isHost = room.hostId === online.myPlayerId;
      return (
        <GameScreen
          game={online}
          theme={theme}
          onToggleTheme={toggleTheme}
          newGameLabel={isHost ? '← В лобби' : '← Покинуть'}
          canStartNew={isHost}
          banner={banner}
          onNewGame={() => {
            if (isHost) void online.newGame();
            else {
              void online.leave();
              setScreen('home');
            }
          }}
        />
      );
    }
    if (room) {
      return (
        <LobbyScreen
          online={online}
          onLeave={() => {
            void online.leave();
            setScreen('home');
          }}
        />
      );
    }
    return <OnlineScreen online={online} initialCode={urlRoom} onBack={() => setScreen('home')} />;
  }

  if (screen === 'game' && game.state) {
    return (
      <GameScreen
        game={game}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNewGame={() => {
          game.reset();
          setScreen('setup');
        }}
      />
    );
  }
  if (screen === 'setup') {
    return (
      <SetupScreen
        onBack={() => setScreen('home')}
        onStart={(players) => {
          game.start(players);
          setScreen('game');
        }}
      />
    );
  }
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
      <div className="text-7xl">🎲</div>
      <h1 className="text-5xl sm:text-6xl font-black tracking-tight mt-3">БЛОХА</h1>
      <p className="text-stone-400 mt-2 max-w-md">Семейная настольная игра: 8×8, один кубик, четыре фигуры, круг по периметру и своя финишная диагональ.</p>
      <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
        <button type="button" data-testid="play-local" onClick={() => setScreen('setup')} className="py-3.5 rounded-xl bg-yellow-400 text-stone-900 font-black text-lg shadow-[0_5px_0_#b08900] active:translate-y-0.5">
          Играть локально / с роботом
        </button>
        <button type="button" data-testid="play-online" onClick={() => setScreen('online')} className="py-3.5 rounded-xl bg-stone-700 font-bold text-lg">
          Онлайн-комната
        </button>
        <button type="button" onClick={toggleTheme} className="py-2 text-stone-400 hover:text-white text-sm">
          Настройки · тема: {theme === 'wood' ? 'Classic Wood' : 'Modern'}
        </button>
      </div>
    </div>
  );
}
