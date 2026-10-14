import type { DiceRoller } from '@blokha/game-engine';
import { normalizeRoomCode } from '@blokha/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { GameScreen } from './components/GameScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { OnlineScreen } from './components/OnlineScreen';
import { SetupScreen } from './components/SetupScreen';
import { useLocalGame } from './game/useLocalGame';
import { loadCredentials, useOnlineGame } from './game/useOnlineGame';
import { THEME_NAMES, THEMES, loadTheme, type Theme } from './game/theme';
import { ProfileScreen } from './components/ProfileScreen';
import { loadStore, saveStore, unlockedCosmetics } from './game/profile';
import { setVoice } from './game/commentator';
import { useAccount } from './game/useAccount';
import { AccountScreen } from './components/AccountScreen';
import { claimDaily, dailyStatus, getProfile, openChest, ownedItems, setPremium, type ChestResult } from './game/profile';
import { DailyModal } from './components/DailyModal';
import { ChestModal } from './components/ChestModal';
import { pickChallenge } from './game/challenges';
import { Avatar } from './components/Avatar';
import type { LocalPlayerSetup } from './game/useLocalGame';

type Screen = 'home' | 'setup' | 'game' | 'online' | 'profile' | 'account';


function roomFromUrl(): string {
  try {
    return normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? '');
  } catch {
    return '';
  }
}

export function App({ dice }: { dice?: DiceRoller } = {}) {
  const [urlRoom] = useState(roomFromUrl);
  const [pendingCode, setPendingCode] = useState('');
  const [screen, setScreen] = useState<Screen>(() => (urlRoom || loadCredentials() ? 'online' : 'home'));
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const game = useLocalGame(dice);
  const account = useAccount(!dice); // в тестах (с подставным кубиком) сервер не нужен
  const [localSeries, setLocalSeries] = useState<{ wins: Record<string, number>; games: number; counted: number }>({ wins: {}, games: 0, counted: -1 });
  useEffect(() => {
    const st = game.state;
    if (!st || st.phase !== 'finished' || !st.winnerId) return;
    setLocalSeries((prev) => {
      if (prev.counted === st.version) return prev;
      return { wins: { ...prev.wins, [st.winnerId!]: (prev.wins[st.winnerId!] ?? 0) + 1 }, games: prev.games + 1, counted: st.version };
    });
  }, [game.state]);
  const online = useOnlineGame(screen === 'online' || screen === 'account' || !!account.me);
  useEffect(() => {
    setPremium(!!account.me?.premium);
    if (account.me) online.bindAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.me?.id, account.me?.premium]);
  // после партии отправляем профиль на сервер
  const finishedKey = game.state?.phase === 'finished' ? `l${game.state.version}` : online.state?.phase === 'finished' ? `o${online.state.version}` : '';
  useEffect(() => {
    if (finishedKey && account.me) setTimeout(() => void account.syncProfile(), 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedKey]);
  const [stake, setStake] = useState('');
  const [rematchRows, setRematchRows] = useState<LocalPlayerSetup[] | undefined>(undefined);
  useEffect(() => {
    setVoice(loadStore().settings.voice);
  }, []);
  const toggleTheme = () =>
    setTheme((t) => {
      // доски открываются достижениями, сундуками и премиумом у любого профиля на устройстве
      const store = loadStore();
      const open = new Set<string>(['wood', 'light']);
      for (const p of Object.values(store.profiles)) {
        for (const th of unlockedCosmetics(p).themes) open.add(th);
        for (const k of ownedItems(p)) if (k.startsWith('board:')) open.add(k.slice(6));
      }
      const order = THEMES.filter((x) => open.has(x));
      return order[(order.indexOf(t) + 1) % order.length] ?? 'wood';
    });
  // ---- ежедневная награда и сундуки для активного профиля (аккаунт или последний человек за устройством)
  const activeName = (() => {
    if (account.me) return account.me.name;
    const fromSetup = game.lastSetup?.find((p) => !p.isBot)?.nickname;
    if (fromSetup) return fromSetup;
    try {
      const last = localStorage.getItem('blokha.lastHuman') ?? localStorage.getItem('blokha.nick');
      if (last) return last;
    } catch {
      /* ignore */
    }
    const profiles = Object.values(loadStore().profiles).sort((a, b) => b.updatedAt - a.updatedAt);
    return profiles[0]?.name ?? '';
  })();
  const [dailyTick, setDailyTick] = useState(0);
  const [chestOpen, setChestOpen] = useState(false);
  const activeProfile = activeName ? getProfile(loadStore(), activeName) : null;
  void dailyTick;
  const daily = activeProfile && activeProfile.totals.games > 0 ? dailyStatus(activeProfile) : null;
  const claimDailyNow = () => {
    if (!activeName) return;
    const store = loadStore();
    const p = getProfile(store, activeName);
    claimDaily(p);
    saveStore(store);
    setDailyTick((v) => v + 1);
    if (p.chests > 0) setChestOpen(true);
  };
  const openChestNow = (): ChestResult | null => {
    if (!activeName) return null;
    const store = loadStore();
    const p = getProfile(store, activeName);
    const r = openChest(p);
    saveStore(store);
    setDailyTick((v) => v + 1);
    return r;
  };
  const chestsCount = activeProfile?.chests ?? 0;
  // ---- испытание партии: одинаковое для всех участников
  const localChallenge = game.state ? pickChallenge(`${game.state.players.map((p) => p.id).join(',')}:${localSeries.games}`) : null;
  useEffect(() => {
    try {
      localStorage.setItem('blokha.theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const acceptInvite = (code: string, id: number) => {
    online.dismissInvite(id);
    const nick = account.me?.name ?? (() => { try { return localStorage.getItem('blokha.nick') ?? ''; } catch { return ''; } })();
    setScreen('online');
    if (nick) void online.join(code, nick);
    else setPendingCode(code);
  };
  const invitesEl = (
    <>
      <InviteToasts invites={online.invites} onAccept={acceptInvite} onDismiss={online.dismissInvite} />
      {screen === 'home' && daily?.claimable && activeProfile && <DailyModal name={activeProfile.name} count={daily.count} rewardDay={daily.reward.day} onClaim={claimDailyNow} />}
      {chestOpen && <ChestModal chests={chestsCount} onOpen={openChestNow} onClose={() => setChestOpen(false)} />}
    </>
  );

  if (screen === 'account') {
    return (
      <Shell theme={theme} extra={invitesEl}>
        <AccountScreen account={account} onBack={() => setScreen(online.room ? 'online' : 'home')} roomCode={online.room?.code} onInvite={online.room ? online.inviteFriend : undefined} friendsVersion={online.friendsVersion} />
      </Shell>
    );
  }
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
          humanIds={online.myPlayerId ? [online.myPlayerId] : []}
          hardBotPresent={room.seats.some((s) => s.isBot && s.botLevel === 'hard')}
          challenge={pickChallenge(`${room.code}:${room.gamesPlayed}`)}
          banner={bannerWithActions}
          onRematch={isHost ? () => { void online.newGame().then((err) => { if (!err) setTimeout(() => void online.start(), 300); }); } : undefined}
          rematchLabel="Реванш!"

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
        <Shell theme={theme} extra={invitesEl}>
          <LobbyScreen
            online={online}
            onInviteFriends={account.me ? () => setScreen('account') : undefined}
            onLeave={() => {
              void online.leave();
              setScreen('home');
            }}
          />
        </Shell>
      );
    }
    return <Shell theme={theme} extra={invitesEl}><OnlineScreen online={online} initialCode={pendingCode || urlRoom} initialNick={account.me?.name ?? ''} onBack={() => setScreen('home')} /></Shell>;
  }

  if (screen === 'profile') {
    return (
      <Shell theme={theme}>
        <ProfileScreen onBack={() => setScreen('home')} initialName={game.lastSetup?.find((p) => !p.isBot)?.nickname ?? 'Игрок 1'} />
      </Shell>
    );
  }
  if (screen === 'game' && game.state) {
    const humans = (game.lastSetup ?? []).filter((p) => !p.isBot).map((p) => p.id);
    const hard = (game.lastSetup ?? []).some((p) => p.isBot && p.botLevel === 'hard');
    return (
      <GameScreen
        game={game}
        theme={theme}
        onToggleTheme={toggleTheme}
        series={localSeries.wins}
        gamesPlayed={localSeries.games}
        humanIds={humans}
        hardBotPresent={hard}
        stake={stake}
        challenge={localChallenge}
        onRematch={() => {
          const setup = game.lastSetup;
          if (!setup) return;
          game.reset();
          game.start(setup);
        }}
        onNewGame={() => {
          setRematchRows(game.lastSetup ?? undefined);
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
          initialRows={rematchRows}
          onStake={setStake}
          onStart={(players) => {
            const human = players.find((p) => !p.isBot);
            try {
              if (human) localStorage.setItem('blokha.lastHuman', human.nickname);
            } catch {
              /* ignore */
            }
            game.start(players);
            setScreen('game');
          }}
        />
      </Shell>
    );
  }
  return (
    <Shell theme={theme} extra={invitesEl}>
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
          <button type="button" data-testid="profile" onClick={() => setScreen('profile')} className="btn-secondary py-3 rounded-xl font-bold">
            🏅 Профиль, достижения, лидеры
          </button>
          {chestsCount > 0 && (
            <button type="button" data-testid="open-chests" onClick={() => setChestOpen(true)} className="btn-primary py-3 rounded-xl font-black animate-pulse">
              🎁 Открыть сундук ({chestsCount})
            </button>
          )}
          <button type="button" data-testid="account" onClick={() => setScreen('account')} className="btn-secondary py-3 rounded-xl font-bold">
            {account.me ? `👤 ${account.me.name} · друзья` : '👤 Войти через Telegram · друзья'}
          </button>
          <button type="button" onClick={toggleTheme} className="py-2 text-sm hover:underline" style={{ color: 'var(--muted)' }}>
            🎨 Тема: {THEME_NAMES[theme]}
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

function Shell({ theme, children, extra }: { theme: Theme; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className={`theme-${theme} app-bg min-h-full`}>
      {children}
      {extra}
    </div>
  );
}

function InviteToasts({ invites, onAccept, onDismiss }: { invites: { id: number; fromName: string; fromAvatar: string; code: string }[]; onAccept: (code: string, id: number) => void; onDismiss: (id: number) => void }) {
  if (invites.length === 0) return null;
  return (
    <div className="fixed left-1/2 bottom-4 -translate-x-1/2 z-40 flex flex-col gap-2 w-[min(92vw,420px)]" data-testid="invites">
      {invites.map((i) => (
        <div key={i.id} className="toast rounded-2xl bg-sky-700 text-white shadow-2xl px-4 py-3 flex items-center gap-3">
          <Avatar emoji={i.fromAvatar} color="#1c7ed6" size={36} />
          <div className="flex-1 min-w-0 text-sm"><b>{i.fromName}</b> зовёт играть в комнату <b className="tracking-widest">{i.code}</b></div>
          <button type="button" onClick={() => onAccept(i.code, i.id)} className="px-3 py-1.5 rounded-lg bg-yellow-400 text-stone-900 font-black text-sm">Войти</button>
          <button type="button" onClick={() => onDismiss(i.id)} className="text-white/70 text-lg" aria-label="Закрыть">×</button>
        </div>
      ))}
    </div>
  );
}

/** Мини-доска на главном экране: четыре угла и диагонали. */
function HomeHero({ theme }: { theme: Theme }) {
  const boardTheme = theme === 'modern' ? 'modern' : 'wood';
  const colors = ['#e8590c', '#1c7ed6', '#2f9e44', '#9c36b5'];
  const homes: Record<string, number> = { '0,7': 0, '7,7': 1, '7,0': 2, '0,0': 3, '1,6': 0, '2,5': 0, '3,4': 0, '6,6': 1, '5,5': 1, '4,4': 1, '6,1': 2, '5,2': 2, '4,3': 2, '1,1': 3, '2,2': 3, '3,3': 3 };
  return (
    <div className={`theme-${boardTheme} board-frame rounded-xl p-1.5 w-40 h-40 sm:w-48 sm:h-48`} aria-hidden>
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
