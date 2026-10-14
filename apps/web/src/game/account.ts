/**
 * Аккаунт игрока: вход через Telegram (сайт — Login Widget, Mini App — initData), токен сессии, HTTP API.
 */
import type { AccountInfo, FriendsResponse } from '@blokha/shared';
import { serverUrl } from './useOnlineGame';

const TOKEN_KEY = 'blokha.auth';

export interface Me extends AccountInfo {
  premium: boolean;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<ApiResult<T>> {
  try {
    const token = getToken();
    const r = await fetch(serverUrl() + path, {
      method: method ?? (body !== undefined ? 'POST' : 'GET'),
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return (await r.json()) as ApiResult<T>;
  } catch {
    return { ok: false, error: { code: 'network', message: 'Нет связи с сервером' } };
  }
}

/** Telegram Mini App: объект WebApp, если игра открыта внутри Telegram. */
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string; username?: string } };
  ready: () => void;
  expand: () => void;
  openInvoice: (url: string, cb?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void) => void;
  openTelegramLink: (url: string) => void;
  colorScheme?: 'light' | 'dark';
  HapticFeedback?: { impactOccurred: (style: 'light' | 'medium' | 'heavy') => void; notificationOccurred: (t: 'success' | 'warning' | 'error') => void };
}
export function telegramWebApp(): TelegramWebApp | null {
  const w = window as unknown as { Telegram?: { WebApp?: TelegramWebApp } };
  const app = w.Telegram?.WebApp;
  return app && app.initData ? app : null;
}

export interface ServerConfig {
  telegramBot: string | null;
  devLogin: boolean;
  payments: boolean;
}
export const fetchConfig = () => api<ServerConfig>('/api/config');
export const fetchMe = () => api<Me>('/api/me');
export const loginTelegramWidget = (user: Record<string, unknown>) => api<{ account: AccountInfo; token: string }>('/api/auth/telegram', user);
export const loginWebApp = (initData: string) => api<{ account: AccountInfo; token: string }>('/api/auth/webapp', { initData });
export const loginDev = (name: string) => api<{ account: AccountInfo; token: string }>('/api/auth/dev', { name });
export const logout = async () => {
  await api('/api/auth/logout', {});
  setToken(null);
};
export const fetchFriends = () => api<FriendsResponse>('/api/friends');
export const requestFriend = (query: string) => api<{ status: string; account: AccountInfo }>('/api/friends/request', { query });
export const respondFriend = (fromId: number, accept: boolean) => api('/api/friends/respond', { fromId, accept });
export const removeFriend = (id: number) => api('/api/friends/remove', { id });
export const fetchFriendsLeaderboard = () => api<{ account: AccountInfo; games: number; wins: number }[]>('/api/friends/leaderboard');
export const fetchProducts = () => api<{ id: string; title: string; description: string; stars: number; kind: 'premium' | 'tip' }[]>('/api/shop/products');
export const createInvoice = (productId: string) => api<{ link: string }>('/api/shop/invoice', { productId });
export const fetchPurchases = () => api<{ purchases: { product: string; stars: number; at: number }[]; premium: boolean }>('/api/shop/purchases');
export const pullProfile = () => api<unknown>('/api/profile');
export const pushProfile = (data: unknown) => api('/api/profile', data, 'PUT');
export const updateAvatar = (avatar: string) => api<AccountInfo>('/api/me/avatar', { avatar }, 'PUT');
