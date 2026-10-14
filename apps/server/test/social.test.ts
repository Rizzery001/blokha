import { describe, expect, it } from 'vitest';
import { AccountService, leagueFor } from '../src/accounts';
import { Db } from '../src/db';

describe('рефералка, рейтинг Эло и лиги, кланы', () => {
  it('реферал: приглашённый получает сундук сразу и дружбу, пригласивший — после первой партии новичка', async () => {
    const db = await Db.open(null);
    const svc = new AccountService(db);
    const a = svc.loginDev('Аня');
    const b = svc.loginDev('Борис', a.account.friendCode);
    expect(svc.areFriends(a.account.id, b.account.id)).toBe(true);
    expect(svc.pendingRewards(b.account.id)).toHaveLength(1);
    expect(svc.pendingRewards(a.account.id)).toHaveLength(0);
    expect(svc.referralsCount(a.account.id)).toBe(1);
    svc.recordGame('R1', [{ accountId: b.account.id, name: 'Борис', won: false }, { accountId: null, name: 'Робот', won: true }]);
    expect(svc.pendingRewards(a.account.id)).toHaveLength(1);
    svc.recordGame('R2', [{ accountId: b.account.id, name: 'Борис', won: true }, { accountId: null, name: 'Робот', won: false }]);
    expect(svc.pendingRewards(a.account.id)).toHaveLength(1); // только один раз
    const claimed = svc.claimRewards(b.account.id);
    expect(claimed.chests).toBe(1);
    expect(svc.pendingRewards(b.account.id)).toHaveLength(0);
    // повторный вход по чужому коду ничего не меняет
    svc.loginDev('Борис', a.account.friendCode);
    expect(svc.referralsCount(a.account.id)).toBe(1);
    db.close();
  });

  it('Эло: победитель забирает очки у людей, роботы не влияют, лиги по рейтингу', async () => {
    const db = await Db.open(null);
    const svc = new AccountService(db);
    const a = svc.loginDev('Аня');
    const b = svc.loginDev('Борис');
    const c = svc.loginDev('Вера');
    expect(a.account.rating).toBe(1000);
    svc.recordGame('R', [{ accountId: a.account.id, name: 'Аня', won: true }, { accountId: b.account.id, name: 'Борис', won: false }, { accountId: c.account.id, name: 'Вера', won: false }, { accountId: null, name: 'Робот', won: false }]);
    const ra = svc.getAccount(a.account.id).rating;
    const rb = svc.getAccount(b.account.id).rating;
    expect(ra).toBe(1016);
    expect(rb).toBe(992);
    // партия с роботом без второго человека рейтинг не меняет
    svc.recordGame('R', [{ accountId: a.account.id, name: 'Аня', won: true }, { accountId: null, name: 'Робот', won: false }]);
    expect(svc.getAccount(a.account.id).rating).toBe(1016);
    expect(leagueFor(1000)).toBe('bronze');
    expect(leagueFor(1050)).toBe('silver');
    expect(leagueFor(1500)).toBe('diamond');
    expect(svc.topRatings()[0]!.id).toBe(a.account.id);
    db.close();
  });

  it('кланы: создание, вход по коду, лента, рейтинг, выход с передачей главы', async () => {
    const db = await Db.open(null);
    const svc = new AccountService(db);
    const a = svc.loginDev('Аня');
    const b = svc.loginDev('Борис');
    const clan = svc.createClan(a.account.id, 'Семья Ивановых', '🦊');
    expect(clan.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(() => svc.createClan(a.account.id, 'Второй', '🐻')).toThrow(/уже в клане/);
    svc.joinClan(b.account.id, clan.code);
    svc.recordGame('R', [{ accountId: a.account.id, name: 'Аня', won: true }, { accountId: b.account.id, name: 'Борис', won: false }]);
    const view = svc.clan(clan.id);
    expect(view.members).toHaveLength(2);
    expect(view.members[0]!.wins30).toBe(1);
    expect(view.rating).toBe(12); // 1 победа ×10 + 2 участия
    expect(view.feed[0]!.text).toContain('Аня победил');
    expect(svc.topClans()[0]!.id).toBe(clan.id);
    expect(() => svc.kickFromClan(b.account.id, a.account.id)).toThrow(/глава/);
    svc.leaveClan(a.account.id);
    expect(svc.clan(clan.id).ownerId).toBe(b.account.id);
    svc.leaveClan(b.account.id);
    expect(() => svc.clan(clan.id)).toThrow(/не найден/);
    db.close();
  });
});
