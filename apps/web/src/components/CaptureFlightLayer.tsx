import { useEffect, useRef, useState } from 'react';
import type { CaptureFlight } from '../game/usePresenter';
import { PieceToken } from './PieceToken';

/**
 * Выбитая фишка «вылетает» с клетки к карточке своего владельца (резерв) по дуге.
 * Позиции берём из DOM: клетка — data-testid="cell-<cell>", карточка — data-testid="player-<id>".
 */
export function CaptureFlightLayer({ flight }: { flight: CaptureFlight | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<{ x: number; y: number; size: number } | null>(null);
  useEffect(() => {
    if (!flight) {
      setGeo(null);
      return;
    }
    const cellEl = document.querySelector<HTMLElement>(`[data-testid="cell-${flight.cell}"]`);
    const targets = Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="player-${flight.playerId}"]`)).filter((el) => el.offsetParent !== null);
    const target = targets[0];
    if (!cellEl) return;
    const a = cellEl.getBoundingClientRect();
    const size = a.width * 0.88;
    const start = { x: a.left + a.width / 2 - size / 2, y: a.top + a.height / 2 - size / 2 };
    setGeo({ ...start, size });
    const el = ref.current;
    if (!el || !target) return;
    const b = target.getBoundingClientRect();
    const end = { x: b.left + Math.min(b.width - size, 56), y: b.top + b.height / 2 - size / 2 };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const anim = el.animate(
      [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 120}px) scale(1.15) rotate(200deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.45) rotate(540deg)`, opacity: 0.2, offset: 1 },
      ],
      { duration: reduce ? 1 : 680, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' },
    );
    return () => anim.cancel();
  }, [flight]);
  if (!flight || !geo) return null;
  return (
    <div ref={ref} className="fixed z-40 pointer-events-none" style={{ left: geo.x, top: geo.y, width: geo.size, height: geo.size }} data-testid="capture-flight" aria-hidden>
      <PieceToken color={flight.color} kind={flight.kind} index={flight.index} />
    </div>
  );
}
