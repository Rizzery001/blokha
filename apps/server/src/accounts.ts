/**
 * Аккаунты (вход через Telegram), профили, друзья и приглашения.
 */
import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET } from '@blokha/shared';
import type { Db } from './db';

export interface Account {
  id: number;
  name: string;
  username: string | null;
  photoUrl: string | null;
  avatar: string;
  friendCode: string;
  rating: number;
  league: League;
}

export type League = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
export const LEAGUES: { id: League; min: number; title: string; icon: string }[] = [
  { id: 'bronze', min: 0, title: 'Бронза', icon: '🥉' },
  { id: 'silver', min: 1050, title: 'Серебро', icon: '🥈' },
  { id: 'gold', min: 1150, title: 'Золото', icon: '🥇' },
  { id: 'platinum', min: 1300, title: 'Платина', icon: '💎' },
  { id: 'diamond', min: 1500, title: 'Алмаз', icon: '👑' },
];
export function leagueFor(rating: number): League {
  let l: League = 'bronze';
  for (const x of LEAGUES) if (rating >= x.min) l = x.id;
  return l;
}

export interface ClanView {
  id: number;
  name: string;
  emblem: string;
  code: string;
  ownerId: number;
  members: (Account & { role: string; wins30: number; games30: number })[];
  rating: number;
  feed: { at: number; text: string }[];
}

export interface FriendView extends Account {
  online: boolean;
  wins: number;
  games: number;
}

export class AccountError extends Error {
  constructor(
    public readonly code: 'badAuth' | 'notFound' | 'badRequest' | 'unauthorized',
    message: string,
  ) {
    super(message);
  }
}

export interface TelegramAuthData {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
}

/** Проверка подписи Telegram Login Widget. */
export function verifyTelegramAuth(data: Record<string, unknown>, botToken: string, now = Date.now()): TelegramAuthData {
  const { hash, ...rest } = data as Record<string, string>;
  if (!hash || typeof hash !== 'string') throw new AccountError('badAuth', 'Нет подписи Telegram');
  const check = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(check).digest('hex');
  if (expected !== hash) throw new AccountError('badAuth', 'Подпись Telegram не сходится');
  const authDate = Number(rest['auth_date']);
  if (!authDate || now / 1000 - authDate > 86400) throw new AccountError('badAuth', 'Данные входа устарели, войдите заново');
  return data as unknown as TelegramAuthData;
}

/** Проверка initData Telegram Mini App (WebApp): secret = HMAC_SHA256('WebAppData', bot_token). */
export function verifyWebAppInitData(initData: string, botToken: string, now = Date.now()): TelegramAuthData {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new AccountError('badAuth', 'Нет подписи Mini App');
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(check).digest('hex');
  if (expected !== hash) throw new AccountError('badAuth', 'Подпись Mini App не сходится');
  const authDate = Number(params.get('auth_date'));
  if (!authDate || now / 1000 - authDate > 86400) throw new AccountError('badAuth', 'Данные входа устарели');
  const user = JSON.parse(params.get('user') ?? '{}') as { id?: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
  if (!user.id) throw new AccountError('badAuth', 'Нет данных пользователя');
  const out: TelegramAuthData = { id: user.id, auth_date: authDate, hash };
  if (user.first_name) out.first_name = user.first_name;
  if (user.last_name) out.last_name = user.last_name;
  if (user.username) out.username = user.username;
  if (user.photo_url) out.photo_url = user.photo_url;
  return out;
}

export class AccountService {
  constructor(
    private db: Db,
    private onlineIds: () => Set<number> = () => new Set(),
  ) {}

  private newFriendCode(): string {
    for (let i = 0; i < 100; i++) {
      let code = '';
      for (let k = 0; k < 6; k++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.db.get('SELECT id FROM accounts WHERE friend_code = ?', [code])) return code;
    }
    throw new Error('friend code');
  }

  private rowToAccount(r: Record<string, unknown>): Account {
    const rating = Number(r['rating'] ?? 1000);
    return { id: Number(r['id']), name: String(r['name']), username: (r['username'] as string | null) ?? null, photoUrl: (r['photo_url'] as string | null) ?? null, avatar: String(r['avatar']), friendCode: String(r['friend_code']), rating, league: leagueFor(rating) };
  }

  loginTelegram(data: TelegramAuthData, ref: string | null = null): { account: Account; token: string } {
    const providerId = String(data.id);
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim().slice(0, 40) || data.username || 'Игрок';
    const now = Date.now();
    const existing = this.db.get('SELECT * FROM accounts WHERE provider = ? AND provider_id = ?', ['telegram', providerId]);
    let id: number;
    if (existing) {
      id = Number(existing['id']);
      this.db.run('UPDATE accounts SET name = ?, username = ?, photo_url = ?, last_seen = ? WHERE id = ?', [name, data.username ?? null, data.photo_url ?? null, now, id]);
    } else {
      const referrer = ref ? this.findByCodeOrUsername(ref) : null;
      this.db.run('INSERT INTO accounts (provider, provider_id, name, username, photo_url, avatar, friend_code, created_at, last_seen, rating, referred_by, referral_rewarded) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', ['telegram', providerId, name, data.username ?? null, data.photo_url ?? null, '🦊', this.newFriendCode(), now, now, 1000, referrer?.id ?? null, 0]);
      id = Number(this.db.get('SELECT last_insert_rowid() AS id')!['id']);
      if (referrer) {
        // приглашённый получает сундук сразу; пригласивший — после первой партии новичка
        this.addReward(id, 'chest', 1, `Вас пригласил ${referrer.name}`);
        this.db.run('INSERT OR IGNORE INTO friendships (from_id, to_id, status, created_at) VALUES (?,?,?,?)', [id, referrer.id, 'accepted', now]);
        this.db.run('INSERT OR IGNORE INTO friendships (from_id, to_id, status, created_at) VALUES (?,?,?,?)', [referrer.id, id, 'accepted', now]);
      }
    }
    const token = randomBytes(32).toString('hex');
    this.db.run('INSERT INTO sessions (token, account_id, created_at, last_used) VALUES (?,?,?,?)', [token, id, now, now]);
    return { account: this.getAccount(id), token };
  }

  /** Dev-вход без Telegram (только если разрешён переменной окружения). */
  loginDev(name: string, ref: string | null = null): { account: Account; token: string } {
    return this.loginTelegram({ id: `dev:${name.toLowerCase()}`, first_name: name, auth_date: Math.floor(Date.now() / 1000), hash: '' }, ref);
  }

  authenticate(token: string | undefined): Account {
    if (!token) throw new AccountError('unauthorized', 'Нужно войти');
    const s = this.db.get('SELECT account_id FROM sessions WHERE token = ?', [token]);
    if (!s) throw new AccountError('unauthorized', 'Сессия не найдена, войдите заново');
    this.db.run('UPDATE sessions SET last_used = ? WHERE token = ?', [Date.now(), token]);
    return this.getAccount(Number(s['account_id']));
  }

  logout(token: string) {
    this.db.run('DELETE FROM sessions WHERE token = ?', [token]);
  }

  getAccount(id: number): Account {
    const r = this.db.get('SELECT * FROM accounts WHERE id = ?', [id]);
    if (!r) throw new AccountError('notFound', 'Аккаунт не найден');
    return this.rowToAccount(r);
  }

  updateAvatar(id: number, avatar: string) {
    this.db.run('UPDATE accounts SET avatar = ? WHERE id = ?', [avatar.slice(0, 8), id]);
  }

  getProfile(id: number): unknown | null {
    const r = this.db.get('SELECT data FROM profiles WHERE account_id = ?', [id]);
    return r ? JSON.parse(String(r['data'])) : null;
  }
  saveProfile(id: number, data: unknown) {
    const json = JSON.stringify(data);
    if (json.length > 200_000) throw new AccountError('badRequest', 'Профиль слишком большой');
    this.db.run('INSERT INTO profiles (account_id, data, updated_at) VALUES (?,?,?) ON CONFLICT(account_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at', [id, json, Date.now()]);
  }

  // ---------- друзья ----------
  findByCodeOrUsername(q: string): Account | null {
    const s = q.trim().replace(/^@/, '');
    if (!s) return null;
    const r = this.db.get('SELECT * FROM accounts WHERE friend_code = ? OR lower(username) = lower(?)', [s.toUpperCase(), s]);
    return r ? this.rowToAccount(r) : null;
  }

  requestFriend(me: number, q: string): { status: 'requested' | 'accepted' | 'already'; account: Account } {
    const other = this.findByCodeOrUsername(q);
    if (!other) throw new AccountError('notFound', 'Игрок с таким кодом или @username не найден');
    if (other.id === me) throw new AccountError('badRequest', 'Это вы сами');
    const existing = this.db.get('SELECT status FROM friendships WHERE from_id = ? AND to_id = ?', [me, other.id]);
    if (existing) return { status: existing['status'] === 'accepted' ? 'already' : 'already', account: other };
    const reverse = this.db.get('SELECT status FROM friendships WHERE from_id = ? AND to_id = ?', [other.id, me]);
    const now = Date.now();
    if (reverse) {
      // встречная заявка: становимся друзьями
      this.db.run('UPDATE friendships SET status = ? WHERE from_id = ? AND to_id = ?', ['accepted', other.id, me]);
      this.db.run('INSERT OR REPLACE INTO friendships (from_id, to_id, status, created_at) VALUES (?,?,?,?)', [me, other.id, 'accepted', now]);
      return { status: 'accepted', account: other };
    }
    this.db.run('INSERT INTO friendships (from_id, to_id, status, created_at) VALUES (?,?,?,?)', [me, other.id, 'pending', now]);
    return { status: 'requested', account: other };
  }

  respondFriend(me: number, fromId: number, accept: boolean) {
    const req = this.db.get('SELECT status FROM friendships WHERE from_id = ? AND to_id = ? AND status = ?', [fromId, me, 'pending']);
    if (!req) throw new AccountError('notFound', 'Заявка не найдена');
    if (accept) {
      this.db.run('UPDATE friendships SET status = ? WHERE from_id = ? AND to_id = ?', ['accepted', fromId, me]);
      this.db.run('INSERT OR REPLACE INTO friendships (from_id, to_id, status, created_at) VALUES (?,?,?,?)', [me, fromId, 'accepted', Date.now()]);
    } else this.db.run('DELETE FROM friendships WHERE from_id = ? AND to_id = ?', [fromId, me]);
  }

  removeFriend(me: number, other: number) {
    this.db.run('DELETE FROM friendships WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', [me, other, other, me]);
  }

  friends(me: number): { friends: FriendView[]; incoming: Account[]; outgoing: Account[] } {
    const online = this.onlineIds();
    const stats = (id: number) => {
      const rows = this.db.all<{ winner_account: number | null; players: string }>('SELECT winner_account, players FROM games WHERE players LIKE ?', [`%"accountId":${id},%`]);
      let games = 0;
      let wins = 0;
      for (const r of rows) {
        const pl = JSON.parse(r.players) as { accountId: number | null }[];
        if (pl.some((p) => p.accountId === id)) {
          games++;
          if (r.winner_account === id) wins++;
        }
      }
      return { games, wins };
    };
    const friends = this.db
      .all('SELECT a.* FROM friendships f JOIN accounts a ON a.id = f.to_id WHERE f.from_id = ? AND f.status = ?', [me, 'accepted'])
      .map((r) => ({ ...this.rowToAccount(r), online: online.has(Number(r['id'])), ...stats(Number(r['id'])) }));
    const incoming = this.db.all('SELECT a.* FROM friendships f JOIN accounts a ON a.id = f.from_id WHERE f.to_id = ? AND f.status = ?', [me, 'pending']).map((r) => this.rowToAccount(r));
    const outgoing = this.db.all('SELECT a.* FROM friendships f JOIN accounts a ON a.id = f.to_id WHERE f.from_id = ? AND f.status = ?', [me, 'pending']).map((r) => this.rowToAccount(r));
    return { friends, incoming, outgoing };
  }

  areFriends(a: number, b: number): boolean {
    return !!this.db.get('SELECT 1 FROM friendships WHERE from_id = ? AND to_id = ? AND status = ?', [a, b, 'accepted']);
  }

  // ---------- покупки (Telegram Stars) ----------
  recordPurchase(accountId: number, product: string, stars: number, chargeId: string, payload: string): boolean {
    if (this.db.get('SELECT 1 FROM purchases WHERE charge_id = ?', [chargeId])) return false; // уже учтено
    this.db.run('INSERT INTO purchases (account_id, product, stars, charge_id, payload, created_at) VALUES (?,?,?,?,?,?)', [accountId, product, stars, chargeId, payload, Date.now()]);
    return true;
  }
  purchases(accountId: number): { product: string; stars: number; at: number }[] {
    return this.db.all<{ product: string; stars: number; created_at: number }>('SELECT product, stars, created_at FROM purchases WHERE account_id = ? ORDER BY created_at DESC', [accountId]).map((r) => ({ product: r.product, stars: Number(r.stars), at: Number(r.created_at) }));
  }
  hasProduct(accountId: number, product: string): boolean {
    return !!this.db.get('SELECT 1 FROM purchases WHERE account_id = ? AND product = ?', [accountId, product]);
  }

  // ---------- награды (сундуки с сервера) ----------
  addReward(accountId: number, kind: 'chest', amount: number, reason: string) {
    this.db.run('INSERT INTO rewards (account_id, kind, amount, reason, created_at, claimed_at) VALUES (?,?,?,?,?,NULL)', [accountId, kind, amount, reason, Date.now()]);
  }
  pendingRewards(accountId: number): { id: number; kind: string; amount: number; reason: string }[] {
    return this.db.all<{ id: number; kind: string; amount: number; reason: string }>('SELECT id, kind, amount, reason FROM rewards WHERE account_id = ? AND claimed_at IS NULL ORDER BY id', [accountId]).map((r) => ({ id: Number(r.id), kind: r.kind, amount: Number(r.amount), reason: r.reason }));
  }
  claimRewards(accountId: number): { chests: number; reasons: string[] } {
    const list = this.pendingRewards(accountId);
    this.db.run('UPDATE rewards SET claimed_at = ? WHERE account_id = ? AND claimed_at IS NULL', [Date.now(), accountId]);
    return { chests: list.filter((r) => r.kind === 'chest').reduce((a, r) => a + r.amount, 0), reasons: list.map((r) => r.reason) };
  }
  referralsCount(accountId: number): number {
    return Number(this.db.get('SELECT COUNT(*) AS n FROM accounts WHERE referred_by = ?', [accountId])!['n']);
  }

  // ---------- партии, рейтинг Эло ----------
  private updateElo(players: { accountId: number | null; won: boolean }[]) {
    const humans = players.filter((p) => p.accountId !== null) as { accountId: number; won: boolean }[];
    if (humans.length < 2) return;
    const winner = humans.find((p) => p.won);
    if (!winner) return;
    const K = 32;
    const ratings = new Map<number, number>();
    for (const h of humans) ratings.set(h.accountId, Number(this.db.get('SELECT rating FROM accounts WHERE id = ?', [h.accountId])?.['rating'] ?? 1000));
    let winnerDelta = 0;
    for (const h of humans) {
      if (h.accountId === winner.accountId) continue;
      const rw = ratings.get(winner.accountId)!;
      const rl = ratings.get(h.accountId)!;
      const expectWin = 1 / (1 + Math.pow(10, (rl - rw) / 400));
      const d = Math.round((K / (humans.length - 1)) * (1 - expectWin));
      winnerDelta += d;
      this.db.run('UPDATE accounts SET rating = MAX(100, rating - ?) WHERE id = ?', [d, h.accountId]);
    }
    this.db.run('UPDATE accounts SET rating = rating + ? WHERE id = ?', [winnerDelta, winner.accountId]);
  }

  recordGame(roomCode: string, players: { accountId: number | null; name: string; won: boolean }[]) {
    const winner = players.find((p) => p.won)?.accountId ?? null;
    this.db.run('INSERT INTO games (room_code, finished_at, winner_account, players) VALUES (?,?,?,?)', [roomCode, Date.now(), winner, JSON.stringify(players)]);
    this.updateElo(players);
    // реферальная награда пригласившему после первой партии новичка
    for (const p of players) {
      if (p.accountId === null) continue;
      const r = this.db.get('SELECT referred_by, referral_rewarded FROM accounts WHERE id = ?', [p.accountId]);
      if (r && r['referred_by'] && !Number(r['referral_rewarded'])) {
        this.db.run('UPDATE accounts SET referral_rewarded = 1 WHERE id = ?', [p.accountId]);
        this.addReward(Number(r['referred_by']), 'chest', 1, `Ваш друг ${p.name} сыграл первую партию`);
      }
    }
  }

  topRatings(limit = 20): Account[] {
    return this.db.all('SELECT * FROM accounts ORDER BY rating DESC, last_seen DESC LIMIT ?', [limit]).map((r) => this.rowToAccount(r));
  }

  // ---------- кланы ----------
  private newClanCode(): string {
    for (let i = 0; i < 100; i++) {
      let code = '';
      for (let k = 0; k < 6; k++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.db.get('SELECT id FROM clans WHERE code = ?', [code])) return code;
    }
    throw new Error('clan code');
  }
  myClanId(accountId: number): number | null {
    const r = this.db.get('SELECT clan_id FROM clan_members WHERE account_id = ?', [accountId]);
    return r ? Number(r['clan_id']) : null;
  }
  createClan(ownerId: number, nameRaw: string, emblem: string): ClanView {
    const name = nameRaw.replace(/\s+/g, ' ').trim().slice(0, 24);
    if (name.length < 2) throw new AccountError('badRequest', 'Название клана: от 2 символов');
    if (this.myClanId(ownerId) !== null) throw new AccountError('badRequest', 'Вы уже в клане, сначала выйдите из него');
    const now = Date.now();
    this.db.run('INSERT INTO clans (name, emblem, code, owner_id, created_at) VALUES (?,?,?,?,?)', [name, emblem.slice(0, 4) || '🛡️', this.newClanCode(), ownerId, now]);
    const id = Number(this.db.get('SELECT last_insert_rowid() AS id')!['id']);
    this.db.run('INSERT INTO clan_members (clan_id, account_id, role, joined_at) VALUES (?,?,?,?)', [id, ownerId, 'owner', now]);
    return this.clan(id);
  }
  joinClan(accountId: number, code: string): ClanView {
    if (this.myClanId(accountId) !== null) throw new AccountError('badRequest', 'Вы уже в клане');
    const c = this.db.get('SELECT id FROM clans WHERE code = ?', [code.trim().toUpperCase()]);
    if (!c) throw new AccountError('notFound', 'Клан с таким кодом не найден');
    const id = Number(c['id']);
    if (Number(this.db.get('SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = ?', [id])!['n']) >= 30) throw new AccountError('badRequest', 'В клане уже 30 участников');
    this.db.run('INSERT INTO clan_members (clan_id, account_id, role, joined_at) VALUES (?,?,?,?)', [id, accountId, 'member', Date.now()]);
    return this.clan(id);
  }
  leaveClan(accountId: number) {
    const id = this.myClanId(accountId);
    if (id === null) return;
    this.db.run('DELETE FROM clan_members WHERE account_id = ?', [accountId]);
    const left = this.db.all('SELECT account_id FROM clan_members WHERE clan_id = ? ORDER BY joined_at', [id]);
    if (left.length === 0) this.db.run('DELETE FROM clans WHERE id = ?', [id]);
    else {
      const c = this.db.get('SELECT owner_id FROM clans WHERE id = ?', [id]);
      if (c && Number(c['owner_id']) === accountId) {
        const next = Number(left[0]!['account_id']);
        this.db.run('UPDATE clans SET owner_id = ? WHERE id = ?', [next, id]);
        this.db.run('UPDATE clan_members SET role = ? WHERE account_id = ?', ['owner', next]);
      }
    }
  }
  kickFromClan(ownerId: number, accountId: number) {
    const id = this.myClanId(ownerId);
    const c = id !== null ? this.db.get('SELECT owner_id FROM clans WHERE id = ?', [id]) : undefined;
    if (!c || Number(c['owner_id']) !== ownerId) throw new AccountError('unauthorized', 'Только глава клана');
    if (accountId === ownerId) throw new AccountError('badRequest', 'Главу нельзя исключить');
    this.db.run('DELETE FROM clan_members WHERE clan_id = ? AND account_id = ?', [id, accountId]);
  }
  clan(id: number): ClanView {
    const c = this.db.get('SELECT * FROM clans WHERE id = ?', [id]);
    if (!c) throw new AccountError('notFound', 'Клан не найден');
    const since = Date.now() - 30 * 86400000;
    const games = this.db.all<{ winner_account: number | null; players: string; finished_at: number }>('SELECT winner_account, players, finished_at FROM games WHERE finished_at >= ? ORDER BY finished_at DESC', [since]);
    const memberRows = this.db.all('SELECT a.*, m.role FROM clan_members m JOIN accounts a ON a.id = m.account_id WHERE m.clan_id = ? ORDER BY m.joined_at', [id]);
    const memberIds = new Set(memberRows.map((r) => Number(r['id'])));
    const members = memberRows.map((r) => {
      const acc = this.rowToAccount(r);
      let wins30 = 0;
      let games30 = 0;
      for (const g of games) {
        const pl = JSON.parse(g.players) as { accountId: number | null }[];
        if (pl.some((p) => p.accountId === acc.id)) {
          games30++;
          if (g.winner_account === acc.id) wins30++;
        }
      }
      return { ...acc, role: String(r['role']), wins30, games30 };
    });
    const feed: { at: number; text: string }[] = [];
    for (const g of games) {
      const pl = JSON.parse(g.players) as { accountId: number | null; name: string; won: boolean }[];
      if (!pl.some((p) => p.accountId !== null && memberIds.has(p.accountId))) continue;
      const w = pl.find((p) => p.won);
      const others = pl.filter((p) => !p.won).map((p) => p.name).join(', ');
      if (w) feed.push({ at: Number(g.finished_at), text: `${w.name} победил${others ? ` в партии с ${others}` : ''}` });
      if (feed.length >= 20) break;
    }
    return { id, name: String(c['name']), emblem: String(c['emblem']), code: String(c['code']), ownerId: Number(c['owner_id']), members, rating: members.reduce((a, m) => a + m.wins30 * 10 + m.games30, 0), feed };
  }
  topClans(limit = 10): { id: number; name: string; emblem: string; members: number; rating: number }[] {
    const ids = this.db.all<{ id: number }>('SELECT id FROM clans').map((r) => Number(r.id));
    return ids
      .map((id) => {
        const c = this.clan(id);
        return { id, name: c.name, emblem: c.emblem, members: c.members.length, rating: c.rating };
      })
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }

  /** Лидерборд среди меня и моих друзей по онлайн-партиям. */
  friendsLeaderboard(me: number): { account: Account; games: number; wins: number }[] {
    const ids = [me, ...this.friends(me).friends.map((f) => f.id)];
    const rows = this.db.all<{ winner_account: number | null; players: string }>('SELECT winner_account, players FROM games');
    const agg = new Map<number, { games: number; wins: number }>();
    for (const id of ids) agg.set(id, { games: 0, wins: 0 });
    for (const r of rows) {
      const pl = JSON.parse(r.players) as { accountId: number | null }[];
      for (const p of pl) {
        if (p.accountId !== null && agg.has(p.accountId)) {
          const e = agg.get(p.accountId)!;
          e.games++;
          if (r.winner_account === p.accountId) e.wins++;
        }
      }
    }
    return ids.map((id) => ({ account: this.getAccount(id), ...agg.get(id)! })).sort((a, b) => b.wins - a.wins || b.games - a.games);
  }
}
