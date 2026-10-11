/**
 * Протокол клиент ↔ сервер для онлайн-комнат BLOKHA (Socket.IO).
 * Сервер авторитетен: кубик бросается только на сервере, клиент присылает лишь намерения.
 */
import type { Corner, GameEvent, GameState } from '@blokha/game-engine';

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface SeatView {
  playerId: string;
  nickname: string;
  corner: Corner;
  pieceSet: string;
  color: string;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  status: RoomStatus;
  seats: SeatView[];
  game: GameState | null;
  /** количество бонусных событий не нужно; версия состояния дублируется для удобства */
  version: number;
  createdAt: number;
}

export interface Credentials {
  code: string;
  playerId: string;
  token: string;
}

export type ErrorCode =
  | 'roomNotFound'
  | 'roomFull'
  | 'badNickname'
  | 'badToken'
  | 'notHost'
  | 'notInLobby'
  | 'notPlaying'
  | 'notYourTurn'
  | 'staleVersion'
  | 'invalidAction'
  | 'cornerTaken'
  | 'tooFewPlayers'
  | 'badRequest';

export interface Ack<T = undefined> {
  ok: boolean;
  error?: { code: ErrorCode; message: string };
  data?: T;
}

export interface JoinResult {
  credentials: Credentials;
  room: RoomSnapshot;
}

export interface SeatUpdate {
  nickname?: string;
  corner?: Corner;
  pieceSet?: string;
  color?: string;
}

export interface GameUpdate {
  version: number;
  state: GameState;
  events: GameEvent[];
}

/** Клиент → сервер (все с ack-колбэком). */
export interface ClientToServerEvents {
  'room:create': (payload: { nickname: string }, ack: (r: Ack<JoinResult>) => void) => void;
  'room:join': (payload: { code: string; nickname: string }, ack: (r: Ack<JoinResult>) => void) => void;
  'room:resume': (payload: Credentials, ack: (r: Ack<JoinResult>) => void) => void;
  'room:updateSeat': (payload: SeatUpdate, ack: (r: Ack) => void) => void;
  'room:start': (payload: Record<string, never>, ack: (r: Ack) => void) => void;
  'room:newGame': (payload: Record<string, never>, ack: (r: Ack) => void) => void;
  'room:leave': (payload: Record<string, never>, ack: (r: Ack) => void) => void;
  'room:addBot': (payload: Record<string, never>, ack: (r: Ack) => void) => void;
  'room:removeBot': (payload: { playerId: string }, ack: (r: Ack) => void) => void;
  'game:roll': (payload: { expectedVersion: number }, ack: (r: Ack<GameUpdate>) => void) => void;
  'game:choose': (payload: { actionId: string; expectedVersion: number }, ack: (r: Ack<GameUpdate>) => void) => void;
}

/** Сервер → клиент. */
export interface ServerToClientEvents {
  'room:state': (room: RoomSnapshot) => void;
  'game:update': (update: GameUpdate) => void;
}

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const NICKNAME_MAX = 20;

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function sanitizeNickname(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, NICKNAME_MAX);
}
