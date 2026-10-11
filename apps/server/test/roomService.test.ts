import { describe, expect, it } from 'vitest';
import { InMemoryRoomStore } from '../src/roomStore';
import { RoomError, RoomService } from '../src/roomService';

function setup(diceSeq: number[] = [6, 3, 2, 5, 1, 4]) {
  let i = 0;
  const service = new RoomService({ store: new InMemoryRoomStore(), dice: () => diceSeq[i++ % diceSeq.length]!, random: () => 0.5 });
  const host = service.create('Хозяин');
  const guest = service.join(host.room.code, 'Гость');
  return { service, host, guest, code: host.room.code };
}

describe('RoomService', () => {
  it('создаёт комнату с кодом из 6 символов, хозяин — первый игрок', () => {
    const { host, guest, service } = setup();
    expect(host.room.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(host.room.hostId).toBe(host.creds.playerId);
    const snap = service.snapshot(service.getRoom(host.room.code));
    expect(snap.seats).toHaveLength(2);
    expect(snap.seats.map((s) => s.corner)).toEqual(['A1', 'H8']);
    expect(JSON.stringify(snap)).not.toContain(guest.creds.token); // токены не утекают в снимок
  });

  it('вход по неверному токену и в несуществующую комнату отклоняется', () => {
    const { service, host } = setup();
    expect(() => service.resume({ ...host.creds, token: 'x' })).toThrow(RoomError);
    expect(() => service.join('ZZZZZZ', 'Кто-то')).toThrow(/не найдена/);
    expect(() => service.join(host.room.code, '   ')).toThrow(/имя/);
  });

  it('угол нельзя занять дважды; максимум 4 места', () => {
    const { service, host, guest, code } = setup();
    expect(() => service.updateSeat(guest.creds, { corner: 'A1' })).toThrow(/занят/);
    service.updateSeat(guest.creds, { corner: 'H1', pieceSet: 'queen', color: '#112233' });
    service.join(code, 'Третий');
    service.addBot(host.creds);
    expect(() => service.join(code, 'Пятый')).toThrow(/заполнена/);
    expect(() => service.addBot(host.creds)).toThrow(/заполнена/);
    expect(() => service.addBot(guest.creds)).toThrow(/хозяин/);
  });

  it('24. чужие команды, повтор одного хода и устаревшая версия отклоняются', () => {
    const { service, host, guest } = setup([6, 6, 2]);
    service.start(host.creds);
    const room = service.getRoom(host.room.code);
    expect(room.status).toBe('playing');
    // ходит хозяин (первый в лобби); гость не может бросить
    expect(() => service.roll(guest.creds, room.version)).toThrow(/не ваш ход/);
    const v0 = room.version;
    const r1 = service.roll(host.creds, v0);
    expect(r1.update.events[0]).toMatchObject({ type: 'rolled', value: 6 });
    // повтор той же команды с той же версией — отклонён
    expect(() => service.roll(host.creds, v0)).toThrow(/устарело/);
    const spawn = r1.update.state.legalActions[0]!;
    const c1 = service.choose(host.creds, spawn.id, r1.update.version);
    expect(() => service.choose(host.creds, spawn.id, r1.update.version)).toThrow(/устарело/);
    // недопустимое действие
    expect(() => service.choose(host.creds, 'move:nope', c1.update.version)).toThrow();
    // гость не может подделать playerId: токен привязан к месту
    expect(() => service.roll({ ...guest.creds, playerId: host.creds.playerId }, c1.update.version)).toThrow(/токен/);
  });

  it('роботы ходят сами, и партия с тремя роботами завершается', () => {
    let seed = 3;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const service = new RoomService({ store: new InMemoryRoomStore(), dice: () => Math.floor(random() * 6) + 1, random });
    const host = service.create('Я');
    service.addBot(host.creds);
    service.addBot(host.creds);
    service.addBot(host.creds);
    service.start(host.creds);
    const code = host.room.code;
    let steps = 0;
    while (service.getRoom(code).status === 'playing' && steps < 100000) {
      const room = service.getRoom(code);
      if (service.isBotTurn(room)) {
        expect(service.botStep(code)).not.toBeNull();
      } else if (room.game!.phase === 'awaitingRoll') {
        service.roll(host.creds, room.version);
      } else {
        service.choose(host.creds, room.game!.legalActions[0]!.id, room.version);
      }
      steps++;
    }
    expect(service.getRoom(code).status).toBe('finished');
    expect(service.botStep(code)).toBeNull();
  });

  it('выход из лобби передаёт хозяина; пустая комната удаляется', () => {
    const { service, host, guest, code } = setup();
    service.addBot(host.creds);
    const after = service.leave(host.creds)!;
    expect(after.hostId).toBe(guest.creds.playerId);
    expect(service.leave(guest.creds)).toBeNull();
    expect(() => service.getRoom(code)).toThrow(/не найдена/);
  });

  it('новая партия возвращает комнату в лобби, сохраняя места', () => {
    const { service, host } = setup();
    service.start(host.creds);
    const room = service.newGame(host.creds);
    expect(room.status).toBe('lobby');
    expect(room.game).toBeNull();
    expect(room.seats).toHaveLength(2);
  });
});

describe('RoomService: серия, уровни робота, замена роботом', () => {
  it('победа увеличивает счёт серии; новая партия сохраняет счёт', () => {
    let seed = 11;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const service = new RoomService({ store: new InMemoryRoomStore(), dice: () => Math.floor(random() * 6) + 1, random });
    const host = service.create('Я');
    service.addBot(host.creds, 'hard');
    service.start(host.creds);
    const code = host.room.code;
    let n = 0;
    while (service.getRoom(code).status === 'playing' && n++ < 100000) {
      const room = service.getRoom(code);
      if (service.isBotTurn(room)) service.botStep(code);
      else if (room.game!.phase === 'awaitingRoll') service.roll(host.creds, room.version);
      else service.choose(host.creds, room.game!.legalActions[0]!.id, room.version);
    }
    const snap = service.snapshot(service.getRoom(code));
    expect(snap.gamesPlayed).toBe(1);
    expect(Object.values(snap.series).reduce((a, b) => a + b, 0)).toBe(1);
    expect(snap.seats[1]!.botLevel).toBe('hard');
    service.newGame(host.creds);
    expect(service.snapshot(service.getRoom(code)).gamesPlayed).toBe(1);
  });

  it('отключившегося игрока можно заменить роботом только во время партии и только хозяину', () => {
    const { service, host, guest, code } = setup();
    expect(() => service.replaceWithBot(host.creds, guest.creds.playerId)).toThrow(/на связи/);
    service.start(host.creds);
    service.setConnected(guest.creds, false);
    expect(() => service.replaceWithBot(guest.creds, host.creds.playerId)).toThrow(/хозяин/);
    const room = service.replaceWithBot(host.creds, guest.creds.playerId);
    const seat = room.seats.find((s) => s.playerId === guest.creds.playerId)!;
    expect(seat.isBot).toBe(true);
    // старый токен больше не действует
    expect(() => service.resume(guest.creds)).toThrow(/токен/);
    expect(service.getRoom(code).game!.players[1]!.nickname).toContain('🤖');
  });
});
