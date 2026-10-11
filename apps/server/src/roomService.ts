import { randomBytes, randomInt } from 'node:crypto';
import {
  applyCommand,
  chooseBotAction,
  createGame,
  currentPlayer,
  CORNERS,
  EngineError,
  type BotLevel,
  type Corner,
  type GameEvent,
} from '@blokha/game-engine';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  sanitizeNickname,
  type Credentials,
  type ErrorCode,
  type GameUpdate,
  type RoomSnapshot,
  type SeatUpdate,
} from '@blokha/shared';
import type { Room, RoomStore, Seat } from './roomStore';

export class RoomError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const PIECE_SETS = ['pawn', 'knight', 'rook', 'bishop', 'queen', 'king'];
const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#9c36b5', '#e03131', '#0ca678'];
const BOT_NAMES = ['Робот Шура', 'Робот Кеша', 'Робот Фима', 'Робот Зина'];
const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];
const MAX_SEATS = 4;
const MIN_SEATS = 2;
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

export interface RoomServiceOptions {
  store: RoomStore;
  /** бросок кубика; по умолчанию crypto.randomInt */
  dice?: () => number;
  /** случайность робота */
  random?: () => number;
}

export class RoomService {
  private store: RoomStore;
  private dice: () => number;
  private random: () => number;

  constructor(opts: RoomServiceOptions) {
    this.store = opts.store;
    this.dice = opts.dice ?? (() => randomInt(1, 7));
    this.random = opts.random ?? Math.random;
  }

  // ---------- helpers ----------

  private newCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.store.has(code)) return code;
    }
    throw new RoomError('badRequest', 'Не удалось создать код комнаты');
  }

  private freeCorner(room: Room): Corner {
    const taken = new Set(room.seats.map((s) => s.corner));
    // порядок по умолчанию: противоположные углы сначала
    for (const c of ['A1', 'H8', 'H1', 'A8'] as Corner[]) if (!taken.has(c)) return c;
    throw new RoomError('roomFull', 'Комната заполнена');
  }

  private pick<T>(options: T[], used: Set<T>): T {
    return options.find((o) => !used.has(o)) ?? options[0]!;
  }

  private makeSeat(room: Room, nickname: string, isBot: boolean): Seat {
    const used = new Set(room.seats.map((s) => s.pieceSet));
    const usedColors = new Set(room.seats.map((s) => s.color));
    return {
      playerId: `p_${randomBytes(6).toString('hex')}`,
      token: randomBytes(24).toString('hex'),
      nickname,
      corner: this.freeCorner(room),
      pieceSet: this.pick(PIECE_SETS, used),
      color: this.pick(COLORS, usedColors),
      connected: true,
      isBot,
      botLevel: 'normal',
    };
  }

  getRoom(code: string): Room {
    const room = this.store.get(code);
    if (!room) throw new RoomError('roomNotFound', 'Комната не найдена');
    return room;
  }

  snapshot(room: Room): RoomSnapshot {
    return {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      seats: room.seats.map((s) => ({
        playerId: s.playerId,
        nickname: s.nickname,
        corner: s.corner,
        pieceSet: s.pieceSet,
        color: s.color,
        connected: s.connected,
        isHost: s.playerId === room.hostId,
        isBot: s.isBot,
        botLevel: s.isBot ? s.botLevel : null,
      })),
      game: room.game,
      version: room.version,
      createdAt: room.createdAt,
      series: room.series ?? {},
      gamesPlayed: room.gamesPlayed ?? 0,
    };
  }

  private seatOf(room: Room, playerId: string): Seat {
    const seat = room.seats.find((s) => s.playerId === playerId);
    if (!seat) throw new RoomError('badToken', 'Игрок не в комнате');
    return seat;
  }

  authenticate(creds: Credentials): { room: Room; seat: Seat } {
    const room = this.getRoom(creds.code);
    const seat = room.seats.find((s) => s.playerId === creds.playerId);
    if (!seat || seat.token !== creds.token) throw new RoomError('badToken', 'Недействительный токен');
    return { room, seat };
  }

  // ---------- lobby ----------

  create(nicknameRaw: string): { room: Room; creds: Credentials } {
    const nickname = sanitizeNickname(nicknameRaw);
    if (!nickname) throw new RoomError('badNickname', 'Введите имя');
    const room: Room = {
      code: this.newCode(),
      hostId: '',
      status: 'lobby',
      seats: [],
      game: null,
      version: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      series: {},
      gamesPlayed: 0,
    };
    const seat = this.makeSeat(room, nickname, false);
    room.seats.push(seat);
    room.hostId = seat.playerId;
    this.store.save(room);
    return { room, creds: { code: room.code, playerId: seat.playerId, token: seat.token } };
  }

  join(code: string, nicknameRaw: string): { room: Room; creds: Credentials } {
    const nickname = sanitizeNickname(nicknameRaw);
    if (!nickname) throw new RoomError('badNickname', 'Введите имя');
    const room = this.getRoom(code);
    if (room.status !== 'lobby') throw new RoomError('notInLobby', 'Партия уже началась');
    if (room.seats.length >= MAX_SEATS) throw new RoomError('roomFull', 'Комната заполнена');
    const seat = this.makeSeat(room, nickname, false);
    room.seats.push(seat);
    this.store.save(room);
    return { room, creds: { code: room.code, playerId: seat.playerId, token: seat.token } };
  }

  resume(creds: Credentials): { room: Room; seat: Seat } {
    const { room, seat } = this.authenticate(creds);
    seat.connected = true;
    this.store.save(room);
    return { room, seat };
  }

  setConnected(creds: Credentials, connected: boolean): Room | null {
    try {
      const { room, seat } = this.authenticate(creds);
      seat.connected = connected;
      this.store.save(room);
      return room;
    } catch {
      return null;
    }
  }

  updateSeat(creds: Credentials, update: SeatUpdate): Room {
    const { room, seat } = this.authenticate(creds);
    if (room.status !== 'lobby') throw new RoomError('notInLobby', 'Менять настройки можно только в лобби');
    if (update.nickname !== undefined) {
      const n = sanitizeNickname(update.nickname);
      if (!n) throw new RoomError('badNickname', 'Введите имя');
      seat.nickname = n;
    }
    if (update.corner !== undefined) {
      if (!CORNERS.includes(update.corner)) throw new RoomError('badRequest', 'Неизвестный угол');
      if (room.seats.some((s) => s !== seat && s.corner === update.corner)) throw new RoomError('cornerTaken', 'Угол уже занят');
      seat.corner = update.corner;
    }
    if (update.pieceSet !== undefined) {
      if (!PIECE_SETS.includes(update.pieceSet)) throw new RoomError('badRequest', 'Неизвестный набор фигур');
      seat.pieceSet = update.pieceSet;
    }
    if (update.color !== undefined) {
      if (!/^#[0-9a-f]{6}$/i.test(update.color)) throw new RoomError('badRequest', 'Неверный цвет');
      seat.color = update.color;
    }
    this.store.save(room);
    return room;
  }

  addBot(creds: Credentials, level: BotLevel = 'normal'): Room {
    const { room, seat } = this.authenticate(creds);
    if (room.hostId !== seat.playerId) throw new RoomError('notHost', 'Только хозяин комнаты добавляет роботов');
    if (room.status !== 'lobby') throw new RoomError('notInLobby', 'Роботов можно добавить только в лобби');
    if (room.seats.length >= MAX_SEATS) throw new RoomError('roomFull', 'Комната заполнена');
    if (!BOT_LEVELS.includes(level)) throw new RoomError('badRequest', 'Неизвестный уровень робота');
    const used = new Set(room.seats.map((s) => s.nickname));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Робот ${room.seats.length + 1}`;
    const bot = this.makeSeat(room, name, true);
    bot.botLevel = level;
    room.seats.push(bot);
    this.store.save(room);
    return room;
  }

  setBotLevel(creds: Credentials, playerId: string, level: BotLevel): Room {
    const { room, seat } = this.authenticate(creds);
    if (room.hostId !== seat.playerId) throw new RoomError('notHost', 'Только хозяин комнаты');
    if (!BOT_LEVELS.includes(level)) throw new RoomError('badRequest', 'Неизвестный уровень робота');
    const bot = room.seats.find((s) => s.playerId === playerId && s.isBot);
    if (!bot) throw new RoomError('badRequest', 'Робот не найден');
    bot.botLevel = level;
    this.store.save(room);
    return room;
  }

  /** Отключившегося человека заменяет робот: во время партии он доигрывает его фигурами, в лобби место освобождается. */
  replaceWithBot(creds: Credentials, playerId: string): Room {
    const { room, seat } = this.authenticate(creds);
    if (room.hostId !== seat.playerId) throw new RoomError('notHost', 'Только хозяин комнаты');
    const target = room.seats.find((s) => s.playerId === playerId && !s.isBot);
    if (!target) throw new RoomError('badRequest', 'Игрок не найден');
    if (target.playerId === seat.playerId) throw new RoomError('badRequest', 'Нельзя заменить самого себя');
    if (target.connected) throw new RoomError('badRequest', 'Игрок на связи, заменить можно только отключившегося');
    if (room.status === 'lobby') {
      room.seats = room.seats.filter((s) => s !== target);
    } else {
      target.isBot = true;
      target.botLevel = 'normal';
      target.token = randomBytes(24).toString('hex'); // старый токен больше не даёт управлять местом
      target.nickname = `🤖 ${target.nickname}`.slice(0, 24);
      target.connected = true;
      if (room.game) {
        const gp = room.game.players.find((p) => p.id === target.playerId);
        if (gp) gp.nickname = target.nickname;
      }
    }
    this.store.save(room);
    return room;
  }

  react(creds: Credentials, emoji: string): { room: Room; playerId: string } {
    const { room, seat } = this.authenticate(creds);
    return { room, playerId: seat.playerId };
    void emoji;
  }

  removeBot(creds: Credentials, playerId: string): Room {
    const { room, seat } = this.authenticate(creds);
    if (room.hostId !== seat.playerId) throw new RoomError('notHost', 'Только хозяин комнаты удаляет роботов');
    if (room.status !== 'lobby') throw new RoomError('notInLobby', 'Только в лобби');
    const idx = room.seats.findIndex((s) => s.playerId === playerId && s.isBot);
    if (idx < 0) throw new RoomError('badRequest', 'Робот не найден');
    room.seats.splice(idx, 1);
    this.store.save(room);
    return room;
  }

  leave(creds: Credentials): Room | null {
    const { room, seat } = this.authenticate(creds);
    if (room.status === 'lobby') {
      room.seats = room.seats.filter((s) => s !== seat);
      const humans = room.seats.filter((s) => !s.isBot);
      if (humans.length === 0) {
        this.store.delete(room.code);
        return null;
      }
      if (room.hostId === seat.playerId) room.hostId = humans[0]!.playerId;
      this.store.save(room);
      return room;
    }
    // во время партии место сохраняется для переподключения; просто помечаем отключение
    seat.connected = false;
    this.store.save(room);
    return room;
  }

  start(creds: Credentials): { room: Room; update: GameUpdate } {
    const { room, seat } = this.authenticate(creds);
    if (room.hostId !== seat.playerId) throw new RoomError('notHost', 'Только хозяин комнаты начинает партию');
    if (room.status !== 'lobby') throw new RoomError('notInLobby', 'Партия уже идёт');
    if (room.seats.length < MIN_SEATS) throw new RoomError('tooFewPlayers', 'Нужно минимум два игрока');
    const { state, events } = createGame({
      players: room.seats.map((s) => ({ id: s.playerId, nickname: s.nickname, corner: s.corner, pieceSet: s.pieceSet, color: s.color })),
    });
    room.game = state;
    room.status = 'playing';
    room.version = state.version;
    this.store.save(room);
    return { room, update: { version: room.version, state, events } };
  }

  newGame(creds: Credentials): Room {
    const { room, seat } = this.authenticate(creds);
    if (room.hostId !== seat.playerId) throw new RoomError('notHost', 'Только хозяин комнаты');
    if (room.status === 'lobby') return room;
    room.status = 'lobby';
    room.game = null;
    room.version = 0;
    for (const s of room.seats) if (!s.isBot && !s.connected) { /* отключённые остаются в списке до выхода */ }
    this.store.save(room);
    return room;
  }

  // ---------- game ----------

  private applyGame(room: Room, playerId: string, expectedVersion: number, fn: () => ReturnType<typeof applyCommand>): GameUpdate {
    if (room.status !== 'playing' || !room.game) throw new RoomError('notPlaying', 'Партия не идёт');
    if (expectedVersion !== room.version) {
      throw new RoomError('staleVersion', `Состояние устарело (у вас ${expectedVersion}, на сервере ${room.version})`);
    }
    if (currentPlayer(room.game).id !== playerId) throw new RoomError('notYourTurn', 'Сейчас не ваш ход');
    let result: ReturnType<typeof applyCommand>;
    try {
      result = fn();
    } catch (e) {
      if (e instanceof EngineError) {
        throw new RoomError(e.code === 'notYourTurn' ? 'notYourTurn' : 'invalidAction', e.message);
      }
      throw e;
    }
    room.game = result.state;
    room.version = result.state.version;
    if (result.state.phase === 'finished') {
      room.status = 'finished';
      room.series ??= {};
      room.gamesPlayed = (room.gamesPlayed ?? 0) + 1;
      if (result.state.winnerId) room.series[result.state.winnerId] = (room.series[result.state.winnerId] ?? 0) + 1;
    }
    this.store.save(room);
    return { version: room.version, state: result.state, events: result.events };
  }

  roll(creds: Credentials, expectedVersion: number): { room: Room; update: GameUpdate } {
    const { room, seat } = this.authenticate(creds);
    const update = this.applyGame(room, seat.playerId, expectedVersion, () =>
      applyCommand(room.game!, { type: 'roll', playerId: seat.playerId, value: this.dice() }),
    );
    return { room, update };
  }

  choose(creds: Credentials, actionId: string, expectedVersion: number): { room: Room; update: GameUpdate } {
    const { room, seat } = this.authenticate(creds);
    const update = this.applyGame(room, seat.playerId, expectedVersion, () =>
      applyCommand(room.game!, { type: 'chooseAction', playerId: seat.playerId, actionId }),
    );
    return { room, update };
  }

  /** Если сейчас ход робота — выполняет один шаг (бросок или выбор) и возвращает обновление. */
  botStep(code: string): { room: Room; update: GameUpdate } | null {
    const room = this.store.get(code);
    if (!room || room.status !== 'playing' || !room.game) return null;
    const cur = currentPlayer(room.game);
    const seat = room.seats.find((s) => s.playerId === cur.id);
    if (!seat?.isBot) return null;
    const game = room.game;
    const update = this.applyGame(room, cur.id, room.version, () => {
      if (game.phase === 'awaitingRoll') return applyCommand(game, { type: 'roll', playerId: cur.id, value: this.dice() });
      const action = chooseBotAction(game, cur.id, this.random, seat.botLevel ?? 'normal');
      return applyCommand(game, { type: 'chooseAction', playerId: cur.id, actionId: action.id });
    });
    return { room, update };
  }

  isBotTurn(room: Room): boolean {
    if (room.status !== 'playing' || !room.game) return false;
    const cur = currentPlayer(room.game);
    return room.seats.some((s) => s.playerId === cur.id && s.isBot);
  }

  /** Удаляет комнаты без активности дольше TTL. */
  sweep(now = Date.now()): number {
    let n = 0;
    for (const room of this.store.all()) {
      if (now - room.updatedAt > ROOM_TTL_MS) {
        this.store.delete(room.code);
        n++;
      }
    }
    return n;
  }
}

export type { GameEvent };
