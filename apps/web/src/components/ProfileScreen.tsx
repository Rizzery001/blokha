import { useMemo, useState } from 'react';
import { Avatar } from './Avatar';
import { LIFETIME, dailyQuests, getProfile, leaderboard, levelFromXp, loadStore, monthKey, saveStore, today, unlockedCosmetics, type Store } from '../game/profile';
import { setVoice } from '../game/commentator';

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

export function ProfileScreen({ onBack, initialName }: { onBack: () => void; initialName: string }) {
  const [store, setStore] = useState<Store>(loadStore);
  const names = Object.values(store.profiles).map((p) => p.name).sort((a, b) => a.localeCompare(b, 'ru'));
  const [name, setName] = useState(() => (store.profiles[initialName.toLowerCase()] ? initialName : names[0] ?? initialName));
  const [tab, setTab] = useState<'profile' | 'achievements' | 'leaders'>('profile');
  const profile = store.profiles[name.toLowerCase()] ?? null;
  const lvl = profile ? levelFromXp(profile.xp) : null;
  const quests = dailyQuests();
  const month = monthKey();
  const leadersAll = useMemo(() => leaderboard(store, null), [store]);
  const leadersMonth = useMemo(() => leaderboard(store, month), [store, month]);
  const unlocked = unlockedCosmetics(profile);
  const toggleVoice = () => {
    const next = { ...store, settings: { ...store.settings, voice: !store.settings.voice } };
    saveStore(next);
    setStore(next);
    setVoice(next.settings.voice);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <button type="button" onClick={onBack} className="text-sm hover:underline" style={{ color: 'var(--muted)' }}>← Назад</button>
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        <h2 className="text-2xl sm:text-3xl font-black">Профиль</h2>
        {names.length > 1 && (
          <select value={name} onChange={(e) => setName(e.target.value)} className="bg-stone-900 rounded-lg px-2 py-1.5 text-sm font-bold" aria-label="Игрок">
            {names.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        )}
      </div>
      <div className="mt-3 flex gap-1 text-sm">
        {([['profile', 'Уровень и задания'], ['achievements', 'Достижения'], ['leaders', 'Лидеры']] as const).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg font-bold ${tab === t ? 'bg-yellow-400 text-stone-900' : 'bg-stone-700'}`}>{label}</button>
        ))}
      </div>

      {!profile && <div className="panel rounded-xl p-4 mt-4 text-sm" style={{ color: 'var(--muted)' }}>Сыграйте первую партию под именем «{name}», и здесь появится ваш профиль.</div>}

      {tab === 'profile' && profile && lvl && (
        <div className="mt-4 space-y-3">
          <div className="panel rounded-2xl p-4 flex items-center gap-4">
            <Avatar emoji={profile.avatar} color="#d99a06" size={64} active />
            <div className="flex-1 min-w-0">
              <div className="text-xl font-black truncate">{profile.name}</div>
              <div className="text-sm" style={{ color: 'var(--muted)' }}>Уровень {lvl.level} · {lvl.title}</div>
              <div className="mt-2 h-3 rounded-full bg-stone-700/60 overflow-hidden" title={`${lvl.into} / ${lvl.need} опыта до следующего уровня`}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (lvl.into / lvl.need) * 100)}%`, background: 'linear-gradient(90deg, #f2c230, #e8590c)' }} />
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{lvl.into} / {lvl.need} опыта · всего {profile.xp}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
            {[['Партий', profile.totals.games], ['Побед', profile.totals.wins], ['Выбил', profile.totals.captures], ['Кругов', profile.totals.laps], ['Шестёрок', profile.totals.sixes], ['Серия побед', profile.totals.bestWinStreak]].map(([k, v]) => (
              <div key={String(k)} className="panel rounded-xl py-2">
                <div className="text-lg font-black" style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                <div className="text-[11px]" style={{ color: 'var(--muted)' }}>{k}</div>
              </div>
            ))}
          </div>
          <div className="panel rounded-2xl p-4">
            <div className="font-black">Задания дня <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>({today()})</span></div>
            <div className="mt-2 space-y-2">
              {quests.map((q) => {
                const done = profile.day.claimed.includes(q.id);
                const cur = Math.min(profile.day.counters[q.metric], q.target);
                return (
                  <div key={q.id} className="flex items-center gap-3 text-sm">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${done ? 'bg-emerald-500 text-white' : 'bg-stone-700'}`}>{done ? '✓' : ''}</span>
                    <span className={`flex-1 ${done ? 'line-through opacity-60' : ''}`}>{q.title}</span>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>{cur}/{q.target} · +{q.xp} оп.</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="panel rounded-2xl p-4">
            <div className="font-black">Открыто</div>
            <div className="mt-2 text-sm flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--muted)' }}>
              <span>Аватары: {[...unlocked.avatars].join(' ')}</span>
              <span>Наборы фигур: {[...unlocked.pieceSets].length}/6</span>
              <span>Темы: {[...unlocked.themes].length}/3</span>
            </div>
          </div>
          <label className="panel rounded-2xl p-4 flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={store.settings.voice} onChange={toggleVoice} className="w-5 h-5" />
            <span className="text-sm">🎙️ Комментатор говорит вслух (голос браузера)</span>
          </label>
        </div>
      )}

      {tab === 'achievements' && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {LIFETIME.map((a) => {
            const got = profile?.unlocked[a.id];
            const cur = profile ? Math.min(profile.totals[a.metric], a.target) : 0;
            return (
              <div key={a.id} className={`panel rounded-xl p-3 flex gap-3 ${got ? '' : 'opacity-75'}`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl ${got ? 'bg-amber-400/20 border border-amber-400/60' : 'bg-stone-700/50 grayscale'}`}>{got ? a.icon : '🔒'}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-black text-sm">{a.title}</div>
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>{a.description}{a.unlocks ? ` · открывает ${a.unlocks.label}` : ''}</div>
                  <div className="mt-1 h-1.5 rounded-full bg-stone-700/60 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: `${(cur / a.target) * 100}%` }} /></div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>{cur}/{a.target}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'leaders' && (
        <div className="mt-4 space-y-4">
          {[[`Сезон: ${MONTHS[Number(month.slice(5)) - 1]}`, leadersMonth], ['За всё время', leadersAll]].map(([title, rows]) => (
            <div key={String(title)} className="panel rounded-2xl p-4">
              <div className="font-black">{title as string}</div>
              {(rows as ReturnType<typeof leaderboard>).length === 0 ? (
                <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Пока нет сыгранных партий.</div>
              ) : (
                <table className="w-full text-sm mt-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr style={{ color: 'var(--muted)' }}><th className="text-left font-medium">Игрок</th><th className="font-medium">Побед</th><th className="font-medium">Партий</th><th className="font-medium">%</th></tr>
                  </thead>
                  <tbody>
                    {(rows as ReturnType<typeof leaderboard>).slice(0, 10).map((r, i) => (
                      <tr key={r.name} className={i === 0 ? 'font-black' : ''}>
                        <td className="py-1 flex items-center gap-2">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} <Avatar emoji={r.avatar} color={r.isBot ? '#64748b' : '#d99a06'} size={22} /> {r.name}</td>
                        <td className="text-center">{r.wins}</td>
                        <td className="text-center">{r.games}</td>
                        <td className="text-center">{r.rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { getProfile };
