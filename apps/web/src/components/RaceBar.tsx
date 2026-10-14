import type { GameState } from '@blokha/game-engine';
import { Avatar } from './Avatar';

/** Гонка: сколько пути до победы прошёл каждый игрок, и простая оценка шансов. */
export function raceProgress(state: GameState): { playerId: string; done: number; total: number; share: number }[] {
  const lap = state.config.perimeter.length;
  const rows = state.players.map((p) => {
    const maxP = lap + state.config.homes[p.corner]!.length - 1;
    const perPiece = maxP + 1; // +1 за выход из резерва
    const total = perPiece * p.pieces.length;
    const done = p.pieces.reduce((a, pc) => a + (pc.progress === null ? 0 : 1 + Math.max(0, pc.progress)), 0);
    return { playerId: p.id, done, total, share: 0 };
  });
  // шансы: softmax по доле пройденного с акцентом на близость к финишу
  const weights = rows.map((r) => Math.exp((r.done / r.total) * 6));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return rows.map((r, i) => ({ ...r, share: weights[i]! / sum }));
}

/** Есть ли у текущего игрока фигура, которой один точный бросок (1..6) приносит победу. */
export function decisiveRollValues(state: GameState): number[] {
  const p = state.players[state.currentPlayerIndex]!;
  const lap = state.config.perimeter.length;
  const maxP = lap + state.config.homes[p.corner]!.length - 1;
  const need = new Set(Array.from({ length: maxP - lap + 1 }, (_, i) => lap + i));
  const placed = p.pieces.filter((pc) => pc.progress !== null && pc.progress >= lap).map((pc) => pc.progress!);
  if (placed.length !== p.pieces.length - 1) return [];
  for (const v of placed) need.delete(v);
  if (need.size !== 1) return [];
  const target = [...need][0]!;
  const last = p.pieces.find((pc) => pc.progress !== null && pc.progress < lap);
  if (!last || last.progress === null) return [];
  const d = target - last.progress;
  return d >= 1 && d <= state.config.diceSides ? [d] : [];
}

export function RaceBar({ state }: { state: GameState }) {
  const rows = raceProgress(state);
  return (
    <div className="w-full max-w-[min(94vw,640px)] panel rounded-xl px-3 py-2 flex flex-col gap-1" data-testid="race">
      {state.players.map((p) => {
        const r = rows.find((x) => x.playerId === p.id)!;
        const pct = Math.round((r.done / r.total) * 100);
        return (
          <div key={p.id} className="flex items-center gap-2 text-xs">
            <Avatar emoji={p.avatar} color={p.color} size={18} />
            <div className="flex-1 h-2.5 rounded-full bg-stone-700/50 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: p.color }} />
            </div>
            <span className="w-14 text-right" style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }} title="Оценка шансов на победу">{Math.round(r.share * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
}
