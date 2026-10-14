/**
 * Аккаунт игрока: вход через Telegram (сайт — Login Widget, Mini App — initData), токен сессии, HTTP API.
 */
import type { AccountInfo, FriendsResponse } from '@blokha/shared';
import { serverUrl } from './useOnlineGame';

const TOKEN_KEY = 'blokha.auth';

export interface Me extends AccountInfo {
  premium: boolean;
  pendingRewards: { id: number; kind: string; amount: number; reason: string }[];
  referrals: number;
  clanId: number | null;
}

export interface ClanView {
  id: number;
  name: string;
  emblem: string;
  code: string;
  ownerId: number;
  members: (AccountInfo & { role: string; wins30: number; games30: number })[];
  rating: number;
  feed: { at: number; text: string }[];
}

/** Реферальный код из ссылки: ?ref=КОД на сайте или start_param в Mini App. */
export function referralFromUrl(): string | null {
  try {
    const wa = telegramWebApp();
    const sp = (wa?.initDataUnsafe as { start_param?: string } | undefined)?.start_param;
    if (sp) return sp;
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      localStorage.setItem('blokha.ref', ref);
      return ref;
    }
    return localStorage.getItem('blokha.ref');
  } catch {
    return null;
  }
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
export const loginTelegramWidget = (user: Record<string, unknown>) => api<{ account: AccountInfo; token: string }>('/api/auth/telegram', { ...user, ref: referralFromUrl() });
export const loginWebApp = (initData: string) => api<{ account: AccountInfo; token: string }>('/api/auth/webapp', { initData, ref: referralFromUrl() });
export const loginDev = (name: string) => api<{ account: AccountInfo; token: string }>('/api/auth/dev', { name, ref: referralFromUrl() });
export const claimRewards = () => api<{ chests: number; reasons: string[] }>('/api/rewards/claim', {});
export const fetchTopRatings = () => api<{ top: AccountInfo[]; leagues: { id: string; min: number; title: string; icon: string }[] }>('/api/ratings/top');
export const fetchClan = () => api<ClanView | null>('/api/clan');
export const createClan = (name: string, emblem: string) => api<ClanView>('/api/clan/create', { name, emblem });
export const joinClan = (code: string) => api<ClanView>('/api/clan/join', { code });
export const leaveClan = () => api('/api/clan/leave', {});
export const kickFromClan = (accountId: number) => api('/api/clan/kick', { accountId });
export const fetchTopClans = () => api<{ id: number; name: string; emblem: string; members: number; rating: number }[]>('/api/clans/top');
export const LEAGUE_INFO: Record<string, { title: string; icon: string }> = { bronze: { title: 'Бронза', icon: '🥉' }, silver: { title: 'Серебро', icon: '🥈' }, gold: { title: 'Золото', icon: '🥇' }, platinum: { title: 'Платина', icon: '💎' }, diamond: { title: 'Алмаз', icon: '👑' } };
export function referralLink(bot: string | null, code: string): string {
  if (bot) return `https://t.me/${bot}/play?startapp=${code}`;
  const u = new URL(window.location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('ref', code);
  return u.toString();
}
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
