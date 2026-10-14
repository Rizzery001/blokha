import { useCallback, useEffect, useState } from 'react';
import type { FriendsResponse } from '@blokha/shared';
import { createInvoice, fetchFriends, fetchFriendsLeaderboard, fetchProducts, fetchPurchases, removeFriend, requestFriend, respondFriend, telegramWebApp } from '../game/account';
import type { AccountState } from '../game/useAccount';
import { Avatar } from './Avatar';
import { TelegramLogin } from './TelegramLogin';

interface Props {
  account: AccountState;
  onBack: () => void;
  /** код текущей комнаты, если игрок в лобби: показать кнопки «Пригласить» */
  roomCode?: string | undefined;
  onInvite?: ((friendId: number) => Promise<string | null>) | undefined;
  /** версия для перечитывания друзей (меняется по событию сервера) */
  friendsVersion?: number;
}

type Product = { id: string; title: string; description: string; stars: number; kind: 'premium' | 'tip' };

export function AccountScreen({ account, onBack, roomCode, onInvite, friendsVersion = 0 }: Props) {
  const { me, config } = account;
  const [friends, setFriends] = useState<FriendsResponse | null>(null);
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [leaders, setLeaders] = useState<{ account: { id: number; name: string; avatar: string }; games: number; wins: number }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [premium, setPremium] = useState(false);
  const [devName, setDevName] = useState('');
  const [tab, setTab] = useState<'friends' | 'shop'>('friends');

  const reload = useCallback(async () => {
    if (!me) return;
    const [f, l, p, pu] = await Promise.all([fetchFriends(), fetchFriendsLeaderboard(), fetchProducts(), fetchPurchases()]);
    if (f.ok && f.data) setFriends(f.data);
    if (l.ok && l.data) setLeaders(l.data);
    if (p.ok && p.data) setProducts(p.data);
    if (pu.ok && pu.data) setPremium(pu.data.premium);
  }, [me]);
  useEffect(() => {
    void reload();
  }, [reload, friendsVersion]);

  const add = async () => {
    const r = await requestFriend(query);
    setMsg(r.ok ? (r.data?.status === 'accepted' ? `Теперь вы друзья с ${r.data.account.name}!` : r.data?.status === 'requested' ? `Заявка отправлена: ${r.data.account.name}` : 'Заявка уже есть') : r.error?.message ?? 'Ошибка');
    setQuery('');
    void reload();
  };
  const buy = async (p: Product) => {
    const r = await createInvoice(p.id);
    if (!r.ok || !r.data) {
      setMsg(r.error?.message ?? 'Не удалось создать счёт');
      return;
    }
    const wa = telegramWebApp();
    if (wa) {
      wa.openInvoice(r.data.link, (status) => {
        if (status === 'paid') {
          setMsg('Оплата прошла! Спасибо 💛');
          setTimeout(() => void reload(), 1500);
          setTimeout(() => void account.refresh(), 1500);
        } else if (status === 'failed') setMsg('Оплата не прошла');
      });
    } else {
      window.open(r.data.link, '_blank', 'noopener');
      setMsg('Счёт открыт в Telegram. После оплаты обновите эту страницу.');
    }
  };
  const copyCode = async () => {
    if (!me) return;
    try {
      await navigator.clipboard.writeText(me.friendCode);
      setMsg('Код скопирован');
    } catch {
      setMsg(me.friendCode);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <button type="button" onClick={onBack} className="text-sm hover:underline" style={{ color: 'var(--muted)' }}>← Назад</button>
      <h2 className="text-2xl sm:text-3xl font-black mt-2">Личный кабинет</h2>

      {!me && (
        <div className="panel rounded-2xl p-4 mt-4 space-y-3">
          <div className="text-sm">Войдите через Telegram, чтобы добавлять друзей, звать их в комнату, сохранять прогресс на всех устройствах и открыть премиум.</div>
          {account.loading && <div className="text-sm" style={{ color: 'var(--muted)' }}>Проверяем вход…</div>}
          {config?.telegramBot ? (
            <TelegramLogin bot={config.telegramBot} onAuth={(u) => void account.loginWithWidget(u)} />
          ) : (
            <div className="text-sm text-amber-300">Вход через Telegram пока не настроен на сервере (нужны TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_USERNAME).</div>
          )}
          {config?.devLogin && (
            <div className="flex gap-2">
              <input value={devName} onChange={(e) => setDevName(e.target.value)} placeholder="Имя (dev-вход)" className="flex-1 bg-stone-900 rounded-lg px-3 py-2 text-sm" data-testid="dev-name" />
              <button type="button" data-testid="dev-login" onClick={() => void account.loginAsDev(devName)} className="btn-secondary px-3 rounded-lg font-bold text-sm">Войти</button>
            </div>
          )}
          {account.error && <div className="text-sm text-rose-300">{account.error}</div>}
        </div>
      )}

      {me && (
        <>
          <div className="panel rounded-2xl p-4 mt-4 flex items-center gap-3">
            {me.photoUrl ? <img src={me.photoUrl} alt="" className="w-14 h-14 rounded-full object-cover" /> : <Avatar emoji={me.avatar} color="#d99a06" size={56} />}
            <div className="flex-1 min-w-0">
              <div className="font-black text-lg truncate">{me.name} {premium && <span className="text-xs align-middle rounded-full bg-amber-400 text-stone-900 px-2 py-0.5 ml-1">ПРЕМИУМ</span>}</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>{me.username ? `@${me.username} · ` : ''}код друга <button type="button" onClick={copyCode} className="font-black tracking-widest hover:underline" data-testid="friend-code">{me.friendCode}</button></div>
            </div>
            <button type="button" onClick={() => void account.logout()} className="text-xs hover:underline" style={{ color: 'var(--muted)' }}>Выйти</button>
          </div>
          <div className="mt-3 flex gap-1 text-sm">
            {([['friends', 'Друзья'], ['shop', 'Премиум']] as const).map(([t, l]) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg font-bold ${tab === t ? 'bg-yellow-400 text-stone-900' : 'bg-stone-700'}`}>{l}</button>
            ))}
          </div>
          {msg && <div className="mt-2 text-sm rounded-lg bg-sky-900/50 text-sky-100 px-3 py-2">{msg}</div>}

          {tab === 'friends' && (
            <div className="mt-3 space-y-3">
              <div className="panel rounded-2xl p-4">
                <div className="font-black">Добавить друга</div>
                <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Введите код друга или @username из Telegram.</div>
                <div className="mt-2 flex gap-2">
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ABC123 или @username" className="flex-1 min-w-0 bg-stone-900 rounded-lg px-3 py-2 text-sm uppercase" data-testid="friend-query" />
                  <button type="button" onClick={() => void add()} disabled={!query.trim()} className="btn-primary px-4 rounded-lg font-bold text-sm disabled:opacity-40" data-testid="friend-add">Добавить</button>
                </div>
              </div>
              {friends && friends.incoming.length > 0 && (
                <div className="panel rounded-2xl p-4">
                  <div className="font-black">Заявки вам</div>
                  {friends.incoming.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 mt-2 text-sm">
                      <Avatar emoji={a.avatar} color="#1c7ed6" size={28} /> <span className="flex-1 truncate">{a.name}</span>
                      <button type="button" onClick={() => respondFriend(a.id, true).then(reload)} className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold">Принять</button>
                      <button type="button" onClick={() => respondFriend(a.id, false).then(reload)} className="px-2 py-1 rounded bg-stone-700 text-xs">Отклонить</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="panel rounded-2xl p-4">
                <div className="font-black">Друзья {friends ? `(${friends.friends.length})` : ''}</div>
                {friends && friends.friends.length === 0 && <div className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Пока никого. Отправьте свой код друга или добавьте друга по @username.</div>}
                {friends?.friends.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 mt-2 text-sm" data-testid={`friend-${f.id}`}>
                    <span className="relative"><Avatar emoji={f.avatar} color="#2f9e44" size={30} /><span className={`absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full border-2 border-stone-800 ${f.online ? 'bg-emerald-400' : 'bg-stone-500'}`} /></span>
                    <span className="flex-1 min-w-0 truncate">{f.name} <span className="text-xs" style={{ color: 'var(--muted)' }}>· побед {f.wins} из {f.games}</span></span>
                    {roomCode && onInvite && (
                      <button type="button" disabled={!f.online} title={f.online ? 'Пригласить в комнату' : 'Не в сети'} onClick={() => onInvite(f.id).then((err) => setMsg(err ?? `Приглашение отправлено: ${f.name}`))} className="px-2 py-1 rounded bg-sky-600 text-white text-xs font-bold disabled:opacity-40">Позвать</button>
                    )}
                    <button type="button" onClick={() => removeFriend(f.id).then(reload)} className="text-xs hover:underline" style={{ color: 'var(--muted)' }}>убрать</button>
                  </div>
                ))}
                {friends && friends.outgoing.length > 0 && <div className="text-xs mt-2" style={{ color: 'var(--muted)' }}>Ждут ответа: {friends.outgoing.map((a) => a.name).join(', ')}</div>}
              </div>
              {leaders.length > 1 && (
                <div className="panel rounded-2xl p-4">
                  <div className="font-black">Лидеры среди друзей (онлайн-партии)</div>
                  <table className="w-full text-sm mt-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <tbody>
                      {leaders.map((l, i) => (
                        <tr key={l.account.id} className={l.account.id === me.id ? 'font-black' : ''}>
                          <td className="py-1">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {l.account.name}</td>
                          <td className="text-right">{l.wins} побед / {l.games}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'shop' && (
            <div className="mt-3 space-y-3">
              {!config?.payments && <div className="text-sm text-amber-300">Платежи не настроены на сервере.</div>}
              {products.map((p) => {
                const owned = p.kind === 'premium' && premium;
                return (
                  <div key={p.id} className={`panel rounded-2xl p-4 flex items-center gap-3 ${p.kind === 'premium' ? 'border-amber-400/60' : ''}`} style={p.kind === 'premium' ? { borderWidth: 2 } : undefined}>
                    <div className="text-3xl">{p.kind === 'premium' ? '👑' : '⭐'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black">{p.title}</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>{p.description}</div>
                    </div>
                    <button type="button" disabled={owned || !config?.payments} onClick={() => void buy(p)} className="btn-primary px-3 py-2 rounded-lg font-black text-sm whitespace-nowrap disabled:opacity-50" data-testid={`buy-${p.id}`}>
                      {owned ? 'Куплено ✓' : `${p.stars} ⭐`}
                    </button>
                  </div>
                );
              })}
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Оплата Telegram Stars открывается внутри Telegram. На сайте ссылка на счёт откроется в приложении Telegram.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
