import { useState } from 'react';
import { RARITY_COLOR, RARITY_LABEL, type Item } from '../game/collection';
import type { ChestResult } from '../game/profile';

/** Открытие сундука: тап по сундуку → тряска → приз. */
export function ChestModal({ chests, onOpen, onClose }: { chests: number; onOpen: () => ChestResult | null; onClose: () => void }) {
  const [phase, setPhase] = useState<'idle' | 'shaking' | 'reveal'>('idle');
  const [result, setResult] = useState<ChestResult | null>(null);
  const open = () => {
    if (phase !== 'idle') return;
    setPhase('shaking');
    setTimeout(() => {
      const r = onOpen();
      setResult(r);
      setPhase('reveal');
    }, 900);
  };
  const again = () => {
    setResult(null);
    setPhase('idle');
  };
  const item: Item | null = result?.item ?? null;
  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4" data-testid="chest-modal">
      <div className="panel rounded-3xl p-6 w-full max-w-sm text-center animate-pop" style={{ borderWidth: 2, borderColor: item ? RARITY_COLOR[item.rarity] : 'var(--accent)' }}>
        {phase !== 'reveal' && (
          <>
            <div className="text-sm" style={{ color: 'var(--muted)' }}>Сундуков: {chests}</div>
            <button type="button" onClick={open} className={`text-8xl my-4 ${phase === 'shaking' ? 'animate-shake' : 'hover:scale-110 transition-transform'}`} aria-label="Открыть сундук" data-testid="chest-open">
              🎁
            </button>
            <div className="font-black">{phase === 'shaking' ? 'Открываем…' : 'Нажмите на сундук'}</div>
          </>
        )}
        {phase === 'reveal' && item && (
          <>
            <div className="text-xs uppercase tracking-wide" style={{ color: RARITY_COLOR[item.rarity] }}>{RARITY_LABEL[item.rarity]} предмет</div>
            <div className="text-7xl my-3 badge-pop">{item.kind === 'avatar' ? item.id : item.kind === 'board' ? '🎨' : item.kind === 'frame' ? '🖼️' : '♟️'}</div>
            <div className="text-xl font-black">{item.title}</div>
            {item.lore && <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{item.lore}</div>}
            {result?.duplicate && <div className="mt-2 text-sm text-amber-300">Уже есть в коллекции → +{result.xp} опыта</div>}
            <div className="mt-5 flex gap-2">
              {chests > 0 && <button type="button" onClick={again} className="btn-primary flex-1 py-3 rounded-xl font-black">Ещё сундук ({chests})</button>}
              <button type="button" onClick={onClose} className="btn-secondary flex-1 py-3 rounded-xl font-bold">Закрыть</button>
            </div>
          </>
        )}
        {phase === 'idle' && <button type="button" onClick={onClose} className="mt-3 text-sm hover:underline" style={{ color: 'var(--muted)' }}>Позже</button>}
      </div>
    </div>
  );
}
