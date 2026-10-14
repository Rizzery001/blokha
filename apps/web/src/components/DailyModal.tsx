import { STREAK_REWARDS } from '../game/profile';

/** Ежедневная награда: серия дней и что даёт сегодняшний день. */
export function DailyModal({ name, count, rewardDay, onClaim }: { name: string; count: number; rewardDay: number; onClaim: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-center justify-center p-4" data-testid="daily-modal">
      <div className="panel rounded-3xl p-6 w-full max-w-md text-center animate-pop" style={{ borderWidth: 2, borderColor: 'var(--accent)' }}>
        <div className="text-sm" style={{ color: 'var(--muted)' }}>С возвращением, {name}!</div>
        <div className="text-2xl font-black mt-1">🔥 {count} {count === 1 ? 'день' : count < 5 ? 'дня' : 'дней'} подряд</div>
        <div className="mt-4 grid grid-cols-7 gap-1">
          {STREAK_REWARDS.map((r) => {
            const idx = r.day;
            const passed = idx < rewardDay;
            const current = idx === rewardDay;
            return (
              <div key={r.day} className={`rounded-lg py-2 text-xs ${current ? 'bg-yellow-400 text-stone-900 font-black scale-105' : passed ? 'bg-emerald-600/40' : 'bg-stone-700/50'}`} title={r.label}>
                <div>{r.day}</div>
                <div className="text-base">{r.chest ? '🎁' : '✨'}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-sm">Сегодня: <b>{STREAK_REWARDS[rewardDay - 1]!.label}</b></div>
        <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Пропустите день — серия начнётся заново.</div>
        <button type="button" onClick={onClaim} className="btn-primary mt-5 w-full py-3 rounded-xl font-black" data-testid="daily-claim">Забрать</button>
      </div>
    </div>
  );
}
