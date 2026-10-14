import { normalizeRoomCode } from '@blokha/shared';
import { useState } from 'react';
import type { OnlineGame } from '../game/useOnlineGame';

function loadNick(): string {
  try {
    return localStorage.getItem('blokha.nick') ?? '';
  } catch {
    return '';
  }
}

export function OnlineScreen({ online, initialCode, onBack, initialNick = '' }: { online: OnlineGame; initialCode: string; onBack: () => void; initialNick?: string }) {
  const [nickname, setNickname] = useState(() => initialNick || loadNick());
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const saveNick = (n: string) => {
    try {
      localStorage.setItem('blokha.nick', n);
    } catch {
      /* ignore */
    }
  };
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    online.clearError();
    saveNick(nickname);
    await fn();
    setBusy(false);
  };
  const connOk = online.conn === 'connected';

  return (
    <div className="max-w-md mx-auto p-4 sm:p-6">
      <button type="button" onClick={onBack} className="text-stone-400 hover:text-white text-sm">← Назад</button>
      <h2 className="text-2xl sm:text-3xl font-black mt-2">Онлайн-комната</h2>
      <p className="text-stone-400 text-sm mt-1">Приватная комната по коду или ссылке. Кубик бросает сервер.</p>
      <div className="mt-2 text-xs">
        {online.conn === 'connected' && <span className="text-emerald-300">● сервер на связи</span>}
        {online.conn === 'connecting' && <span className="text-stone-400">● подключение…</span>}
        {online.conn === 'disconnected' && <span className="text-rose-300">● сервер недоступен (запустите apps/server)</span>}
      </div>

      <label className="block mt-5 text-sm text-stone-300">Ваше имя</label>
      <input
        data-testid="online-nick"
        value={nickname}
        maxLength={20}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="Например, Дима"
        className="mt-1 w-full bg-stone-900 rounded-lg px-3 py-3 text-base font-bold outline-none focus:ring-2 ring-yellow-400"
      />

      <button
        type="button"
        data-testid="create-room"
        disabled={busy || !connOk || !nickname.trim()}
        onClick={() => run(() => online.create(nickname))}
        className="mt-4 w-full py-3.5 rounded-xl bg-yellow-400 text-stone-900 font-black text-lg disabled:opacity-40 shadow-[0_5px_0_#b08900] active:translate-y-0.5"
      >
        Создать комнату
      </button>

      <div className="mt-6 flex items-center gap-3 text-stone-500 text-xs"><span className="flex-1 h-px bg-stone-700" />или войти по коду<span className="flex-1 h-px bg-stone-700" /></div>
      <div className="mt-3 flex gap-2">
        <input
          data-testid="join-code"
          value={code}
          onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
          placeholder="КОД"
          className="flex-1 min-w-0 bg-stone-900 rounded-lg px-3 py-3 text-xl font-black tracking-[0.3em] uppercase outline-none focus:ring-2 ring-yellow-400"
        />
        <button
          type="button"
          data-testid="join-room"
          disabled={busy || !connOk || !nickname.trim() || code.length < 6}
          onClick={() => run(() => online.join(code, nickname))}
          className="px-5 rounded-xl bg-stone-700 font-black disabled:opacity-40"
        >
          Войти
        </button>
      </div>
      {online.error && <div className="mt-3 rounded-lg bg-rose-900/70 text-rose-100 text-sm px-3 py-2">{online.error}</div>}
    </div>
  );
}
