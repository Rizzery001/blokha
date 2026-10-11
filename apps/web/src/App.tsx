import { useEffect, useState } from 'react';
import { GameScreen } from './components/GameScreen';
import { SetupScreen } from './components/SetupScreen';
import { useLocalGame } from './game/useLocalGame';
import type { DiceRoller } from '@blokha/game-engine';

type Screen = 'home' | 'setup' | 'game';
type Theme = 'wood' | 'modern';

function loadTheme(): Theme {
  try {
    return localStorage.getItem('blokha.theme') === 'modern' ? 'modern' : 'wood';
  } catch {
    return 'wood';
  }
}

export function App({ dice }: { dice?: DiceRoller } = {}) {
  const [screen, setScreen] = useState<Screen>('home');
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const game = useLocalGame(dice);
  useEffect(() => {
    try {
      localStorage.setItem('blokha.theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  if (screen === 'game' && game.state) {
    return (
      <GameScreen
        game={game}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'wood' ? 'modern' : 'wood'))}
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
          Играть локально
        </button>
        <button type="button" disabled title="Онлайн-комнаты появятся на Этапе 3" className="py-3.5 rounded-xl bg-stone-700 font-bold opacity-50 cursor-not-allowed">
          Создать комнату (скоро)
        </button>
        <button type="button" disabled title="Онлайн-комнаты появятся на Этапе 3" className="py-3.5 rounded-xl bg-stone-700 font-bold opacity-50 cursor-not-allowed">
          Войти по коду (скоро)
        </button>
        <button type="button" onClick={() => setTheme((t) => (t === 'wood' ? 'modern' : 'wood'))} className="py-2 text-stone-400 hover:text-white text-sm">
          Настройки · тема: {theme === 'wood' ? 'Classic Wood' : 'Modern'}
        </button>
      </div>
    </div>
  );
}
