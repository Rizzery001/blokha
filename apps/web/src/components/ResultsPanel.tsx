import type { GameState, PlayerStats } from '@blokha/game-engine';
import { finalAwards } from '../game/achievements';
import type { Achievement } from '../game/achievements';
import { Avatar } from './Avatar';
import { funTitles, luck } from '../game/outcome';
import { levelFromXp, type ProfileDelta } from '../game/profile';

interface Props {
  state: GameState;
  achievements: Record<string, Achievement[]>;
  series: Record<string, number>;
  gamesPlayed: number;
  captureMatrix?: Record<string, Record<string, number>>;
  landings?: Record<string, Record<string, number>>;
  deltas?: ProfileDelta[];
}

const COLS: { key: keyof PlayerStats; label: string; title: string }[] = [
  { key: 'piecesFinished', label: '🏁', title: 'Фигур на финише' },
  { key: 'captures', label: '🏹', title: 'Выбил' },
  { key: 'captured', label: '💥', title: 'Был выбит' },
  { key: 'sixes', label: '🎲', title: 'Шестёрок' },
  { key: 'bonusCells', label: '🍀', title: 'Бонусных клеток' },
  { key: 'penaltyCells', label: '🌧️', title: 'Штрафных клеток' },
  { key: 'rolls', label: '#', title: 'Бросков' },
];

/** Итоги партии: таблица, награды, достижения, счёт серии. */
export function ResultsPanel({ state, achievements, series, gamesPlayed, captureMatrix = {}, landings = {}, deltas = [] }: Props) {
  const awards = finalAwards(state);
  const titles = funTitles(state, captureMatrix, landings);
  const luckRows = luck(state).filter((r) => r.rolls >= 12);
  const luckiest = luckRows.length ? [...luckRows].sort((a, b) => b.delta - a.delta)[0]! : null;
  const unluckiest = luckRows.length ? [...luckRows].sort((a, b) => a.delta - b.delta)[0]! : null;
  const nm = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? id;
  const rows = [...state.players].sort((a, b) => {
    const sa = state.stats?.[a.id];
    const sb = state.stats?.[b.id];
    if (a.id === state.winnerId) return -1;
    if (b.id === state.winnerId) return 1;
    return (sb?.piecesFinished ?? 0) - (sa?.piecesFinished ?? 0) || (sb?.captures ?? 0) - (sa?.captures ?? 0);
  });
  return (
    <div className="text-left" data-testid="results">
      {gamesPlayed > 0 && (
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--muted)' }}>
          Счёт серии ({gamesPlayed} {gamesPlayed === 1 ? 'партия' : gamesPlayed < 5 ? 'партии' : 'партий'}):{' '}
          {state.players.map((p) => `${p.nickname} ${series[p.id] ?? 0}`).join(' : ')}
        </div>
      )}
      <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr style={{ color: 'var(--muted)' }}>
            <th className="text-left font-medium py-1">Игрок</th>
            {COLS.map((c) => (
              <th key={c.key} className="font-medium py-1 px-1 text-center" title={c.title}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const s = state.stats?.[p.id];
            return (
              <tr key={p.id} className={p.id === state.winnerId ? 'font-black' : ''}>
                <td className="py-1 truncate max-w-[120px]">
                  <span className="inline-block mr-1.5 align-middle"><Avatar emoji={p.avatar} color={p.color} size={20} /></span>
                  {p.id === state.winnerId ? '🏆 ' : ''}{p.nickname}
                </td>
                {COLS.map((c) => (
                  <td key={c.key} className="py-1 px-1 text-center">{s ? s[c.key] : '–'}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {awards.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {awards.map((a) => (
            <span key={a.title} className="badge-pop rounded-full bg-amber-400/15 border border-amber-400/50 px-2 py-0.5 text-xs" title={a.value}>
              {a.icon} {a.title}: <b>{state.players.find((p) => p.id === a.playerId)?.nickname}</b> ({a.value})
            </span>
          ))}
        </div>
      )}
      {titles.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {titles.map((t, i) => (
            <span key={i} className="rounded-full bg-sky-400/15 border border-sky-400/40 px-2 py-0.5 text-xs">{t.icon} {t.title}: <b>{nm(t.playerId)}</b></span>
          ))}
        </div>
      )}
      {luckiest && unluckiest && luckiest.playerId !== unluckiest.playerId && (
        <div className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          🍀 Везение: {nm(luckiest.playerId)} выбросил {luckiest.sixes} шестёрок при норме {luckiest.expected.toFixed(1)}
          {luckiest.delta >= 3 ? ' — читер?' : ''}; {nm(unluckiest.playerId)}: {unluckiest.sixes} при норме {unluckiest.expected.toFixed(1)}.
        </div>
      )}
      {deltas.length > 0 && (
        <div className="mt-3 space-y-1">
          {deltas.map((d) => {
            const lvl = levelFromXp(0);
            void lvl;
            return (
              <div key={d.name} className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 text-xs">
                <b>{d.name}</b>: +{d.xpGained} опыта
                {d.levelAfter > d.levelBefore && <span className="ml-1 font-black text-amber-300">⬆ уровень {d.levelAfter}!</span>}
                {d.newLifetime.map((a) => (
                  <span key={a.id} className="ml-2">{a.icon} {a.title}{a.unlocks ? ` (открыто: ${a.unlocks.label})` : ''}</span>
                ))}
                {d.questsDone.map((q) => (
                  <span key={q.id} className="ml-2">✅ задание: {q.title}</span>
                ))}
              </div>
            );
          })}
        </div>
      )}
      {Object.values(achievements).some((l) => l.length > 0) && (
        <div className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
          Достижения:{' '}
          {state.players
            .filter((p) => (achievements[p.id] ?? []).length > 0)
            .map((p) => `${p.nickname}: ${(achievements[p.id] ?? []).map((a) => a.icon).join('')}`)
            .join(' · ')}
        </div>
      )}
    </div>
  );
}
