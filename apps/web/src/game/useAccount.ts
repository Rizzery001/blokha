import { useCallback, useEffect, useState } from 'react';
import { fetchConfig, fetchMe, getToken, loginDev, loginTelegramWidget, loginWebApp, logout as apiLogout, setToken, telegramWebApp, type Me, type ServerConfig } from './account';
import { getProfile, loadStore, saveStore, type Profile } from './profile';
import { pullProfile, pushProfile } from './account';

export interface AccountState {
  me: Me | null;
  config: ServerConfig | null;
  loading: boolean;
  error: string | null;
  inTelegram: boolean;
  loginWithWidget: (user: Record<string, unknown>) => Promise<void>;
  loginAsDev: (name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** отправить локальный профиль этого игрока на сервер (после партии) */
  syncProfile: () => Promise<void>;
}

/** Слияние профиля с сервера и локального: берём тот, где больше опыта, достижения объединяем. */
function mergeProfile(local: Profile, remote: Profile | null): Profile {
  if (!remote) return local;
  const base = remote.xp >= local.xp ? remote : local;
  const other = base === remote ? local : remote;
  return { ...base, unlocked: { ...other.unlocked, ...base.unlocked }, totals: { ...base.totals }, name: local.name, avatar: base.avatar };
}

export function useAccount(enabled = true): AccountState {
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const inTelegram = typeof window !== 'undefined' && telegramWebApp() !== null;

  const afterLogin = useCallback(async (account: { name: string; avatar: string }) => {
    // подтянуть профиль с сервера и слить с локальным
    const store = loadStore();
    const local = getProfile(store, account.name, account.avatar);
    const remote = await pullProfile();
    if (remote.ok && remote.data) {
      store.profiles[account.name.toLowerCase()] = mergeProfile(local, remote.data as Profile);
      saveStore(store);
    } else if (remote.ok) {
      await pushProfile(local);
    }
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetchMe();
    if (r.ok && r.data) {
      setMe(r.data);
      setError(null);
    } else {
      if (r.error?.code === 'unauthorized') setToken(null);
      setMe(null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const cfg = await fetchConfig();
      if (cancelled) return;
      if (cfg.ok && cfg.data) setConfig(cfg.data);
      const wa = telegramWebApp();
      if (wa && !getToken()) {
        // внутри Telegram вход автоматический
        wa.ready();
        wa.expand();
        const r = await loginWebApp(wa.initData);
        if (r.ok && r.data) {
          setToken(r.data.token);
          await afterLogin(r.data.account);
        } else setError(r.error?.message ?? 'Не удалось войти через Telegram');
      }
      if (getToken()) await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, refresh, afterLogin]);

  const loginWithWidget = useCallback(
    async (user: Record<string, unknown>) => {
      const r = await loginTelegramWidget(user);
      if (!r.ok || !r.data) {
        setError(r.error?.message ?? 'Ошибка входа');
        return;
      }
      setToken(r.data.token);
      await afterLogin(r.data.account);
      await refresh();
    },
    [afterLogin, refresh],
  );
  const loginAsDev = useCallback(
    async (name: string) => {
      const r = await loginDev(name);
      if (!r.ok || !r.data) {
        setError(r.error?.message ?? 'Ошибка входа');
        return;
      }
      setToken(r.data.token);
      await afterLogin(r.data.account);
      await refresh();
    },
    [afterLogin, refresh],
  );
  const logout = useCallback(async () => {
    await apiLogout();
    setMe(null);
  }, []);
  const syncProfile = useCallback(async () => {
    if (!me) return;
    const store = loadStore();
    const p = store.profiles[me.name.toLowerCase()];
    if (p) await pushProfile(p);
  }, [me]);

  return { me, config, loading, error, inTelegram, loginWithWidget, loginAsDev, logout, refresh, syncProfile };
}
