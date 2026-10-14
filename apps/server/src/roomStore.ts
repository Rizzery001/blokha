import type { BotLevel, Corner, GameState } from '@blokha/game-engine';
import type { RoomStatus } from '@blokha/shared';

export interface Seat {
  playerId: string;
  token: string;
  nickname: string;
  corner: Corner;
  pieceSet: string;
  color: string;
  avatar: string;
  connected: boolean;
  isBot: boolean;
  botLevel: BotLevel;
}

export interface Room {
  code: string;
  hostId: string;
  status: RoomStatus;
  seats: Seat[];
  game: GameState | null;
  version: number;
  createdAt: number;
  updatedAt: number;
  series: Record<string, number>;
  gamesPlayed: number;
}

/**
 * Абстракция хранилища комнат. В MVP — память процесса: перезапуск сервера удаляет все партии.
 * Для постоянного хранения реализуйте этот интерфейс поверх БД.
 */
export interface RoomStore {
  get(code: string): Room | undefined;
  save(room: Room): void;
  delete(code: string): void;
  has(code: string): boolean;
  all(): Room[];
}

export class InMemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Room>();
  get(code: string) {
    return this.rooms.get(code);
  }
  save(room: Room) {
    room.updatedAt = Date.now();
    this.rooms.set(room.code, room);
  }
  delete(code: string) {
    this.rooms.delete(code);
  }
  has(code: string) {
    return this.rooms.has(code);
  }
  all() {
    return [...this.rooms.values()];
  }
}
