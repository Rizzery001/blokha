import type { DiceRoller } from '@blokha/game-engine';
import { normalizeRoomCode } from '@blokha/shared';
import { useEffect, useState, type ReactNode } from 'react';
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
  const [localSeries, setLocalSeries] = useState<{ wins: Record<string, number>; games: number; counted: number }>({ wins: {}, games: 0, counted: -1 });
  useEffect(() => {
    const st = game.state;
    if (!st || st.phase !== 'finished' || !st.winnerId) return;
    setLocalSeries((prev) => {
      if (prev.counted === st.version) return prev;
      return { wins: { ...prev.wins, [st.winnerId!]: (prev.wins[st.winnerId!] ?? 0) + 1 }, games: prev.games + 1, counted: st.version };
    });
  }, [game.state]);
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
      const bannerWithActions =
        banner && offline.length > 0 && online.conn === 'connected' && isHost ? (
          <div className="w-full max-w-[min(94vw,640px)] rounded-lg bg-amber-900/60 text-amber-100 text-sm px-3 py-2 flex flex-wrap items-center gap-2">
            <span>Ждём игрока: {offline.map((s) => s.nickname).join(', ')}.</span>
            {offline.map((s) => (
              <button key={s.playerId} type="button" onClick={() => online.replaceWithBot(s.playerId)} className="px-2 py-1 rounded-md bg-sky-600 text-white text-xs font-bold">
                🤖 Доиграть роботом за {s.nickname}
              </button>
            ))}
          </div>
        ) : (
          banner
        );
      return (
        <GameScreen
          game={online}
          theme={theme}
          onToggleTheme={toggleTheme}
          newGameLabel={isHost ? '← В лобби' : '← Покинуть'}
          canStartNew={isHost}
          series={room.series}
          gamesPlayed={room.gamesPlayed}
          banner={bannerWithActions}
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
        <Shell theme={theme}>
          <LobbyScreen
            online={online}
            onLeave={() => {
              void online.leave();
              setScreen('home');
            }}
          />
        </Shell>
      );
    }
    return <Shell theme={theme}><OnlineScreen online={online} initialCode={urlRoom} onBack={() => setScreen('home')} /></Shell>;
  }

  if (screen === 'game' && game.state) {
    return (
      <GameScreen
        game={game}
        theme={theme}
        onToggleTheme={toggleTheme}
        series={localSeries.wins}
        gamesPlayed={localSeries.games}
        onNewGame={() => {
          game.reset();
          setScreen('setup');
        }}
      />
    );
  }
  if (screen === 'setup') {
    return (
      <Shell theme={theme}>
        <SetupScreen
          onBack={() => setScreen('home')}
          onStart={(players) => {
            game.start(players);
            setScreen('game');
          }}
        />
      </Shell>
    );
  }
  return (
    <Shell theme={theme}>
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-10 text-center">
        <HomeHero theme={theme} />
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight mt-4">БЛОХА</h1>
        <p className="mt-2 max-w-md" style={{ color: 'var(--muted)' }}>Семейная настольная игра: доска 8×8, один кубик, четыре фигуры, круг по периметру и своя финишная диагональ.</p>
        <div className="mt-8 flex flex-col gap-3 w-full max-w-xs">
          <button type="button" data-testid="play-local" onClick={() => setScreen('setup')} className="btn-primary py-3.5 rounded-xl font-black text-lg transition-transform">
            Играть локально / с роботом
          </button>
          <button type="button" data-testid="play-online" onClick={() => setScreen('online')} className="btn-secondary py-3.5 rounded-xl font-bold text-lg">
            Онлайн-комната
          </button>
          <button type="button" onClick={toggleTheme} className="py-2 text-sm hover:underline" style={{ color: 'var(--muted)' }}>
            Настройки · тема: {theme === 'wood' ? 'Classic Wood' : 'Modern'}
          </button>
        </div>
        <div className="mt-8 text-xs" style={{ color: 'var(--muted)' }}>Четыре стартовых угла: 1 слева внизу, 2 справа внизу, 3 справа вверху, 4 слева вверху. Семь особых клеток:</div>
        <div className="mt-2 grid grid-cols-7 gap-1.5 max-w-xs w-full text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
          {[['A2', '5 ▲'], ['H5', '3 ▲'], ['H7', '5 ▼'], ['D1', '−1'], ['C8', '−3'], ['E8', '+1'], ['F1', '+3']].map(([c, t]) => (
            <div key={c} className="panel rounded-md py-1.5">
              <div className="font-black text-sm" style={{ color: 'var(--fg)' }}>{t}</div>
              <div>{c}</div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <div className={`theme-${theme} app-bg min-h-full`}>{children}</div>;
}

/** Мини-доска на главном экране: четыре угла и диагонали. */
function HomeHero({ theme }: { theme: Theme }) {
  const colors = ['#e8590c', '#1c7ed6', '#2f9e44', '#9c36b5'];
  const homes: Record<string, number> = { '0,7': 0, '7,7': 1, '7,0': 2, '0,0': 3, '1,6': 0, '2,5': 0, '3,4': 0, '6,6': 1, '5,5': 1, '4,4': 1, '6,1': 2, '5,2': 2, '4,3': 2, '1,1': 3, '2,2': 3, '3,3': 3 };
  return (
    <div className={`theme-${theme} board-frame rounded-xl p-1.5 w-40 h-40 sm:w-48 sm:h-48`} aria-hidden>
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-sm overflow-hidden board-grid">
        {Array.from({ length: 64 }, (_, i) => {
          const x = i % 8;
          const y = Math.floor(i / 8);
          const dark = (x + y) % 2 === 1;
          const h = homes[`${x},${y}`];
          return (
            <div key={i} className={`relative ${dark ? 'cell-dark' : 'cell-light'}`}>
              {h !== undefined && <div className="absolute inset-[22%] rounded-full" style={{ background: colors[h], opacity: 0.85 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
