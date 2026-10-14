/**
 * Протокол клиент ↔ сервер для онлайн-комнат BLOKHA (Socket.IO).
 * Сервер авторитетен: кубик бросается только на сервере, клиент присылает лишь намерения.
 */
import type { BotLevel, Corner, GameEvent, GameState } from '@blokha/game-engine';

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface SeatView {
  playerId: string;
  nickname: string;
  corner: Corner;
  pieceSet: string;
  color: string;
  avatar: string;
  connected: boolean;
  isHost: boolean;
  isBot: boolean;
  botLevel: BotLevel | null;
}

export interface RoomSnapshot {
  code: string;
  hostId: string;
  status: RoomStatus;
  seats: SeatView[];
  game: GameState | null;
  version: number;
  createdAt: number;
  /** счёт серии партий в этой комнате: playerId → число побед */
  series: Record<string, number>;
  gamesPlayed: number;
}

export const REACTIONS = ['👍', '😂', '😱', '🔥', '😭', '🎲', '👏', '🤬'] as const;
/** Быстрые фразы: отправляются ключом, текст берётся из таблицы на клиенте. */
export const PHRASES = {
  lucky: 'Ну и повезло!',
  setup: 'Это была подстава!',
  holdon: 'Держись!',
  gg: 'Хорошая партия!',
  hurry: 'Ходи уже!',
  revenge: 'Я отомщу!',
  oops: 'Ой…',
  sorry: 'Извини 😅',
} as const;
export type PhraseKey = keyof typeof PHRASES;
export type Reaction = (typeof REACTIONS)[number] | PhraseKey;
export const ALL_REACTIONS: readonly string[] = [...REACTIONS, ...Object.keys(PHRASES)];

export interface ReactionEvent {
  playerId: string;
  emoji: Reaction;
  at: number;
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
  avatar?: string;
}

export const AVATARS = ['🦊', '🐻', '🐼', '🦁', '🐯', '🐸', '🐵', '🐰', '🐨', '🦄', '🐲', '🐙', '🦉', '🐧', '🦋', '🌻', '⭐', '🍕', '🚀', '🎩'] as const;
export const BOT_AVATARS = ['🤖', '👾', '🛸', '🎛️'] as const;

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
  'room:addBot': (payload: { level?: BotLevel }, ack: (r: Ack) => void) => void;
  'room:removeBot': (payload: { playerId: string }, ack: (r: Ack) => void) => void;
  'room:setBotLevel': (payload: { playerId: string; level: BotLevel }, ack: (r: Ack) => void) => void;
  /** хозяин: отключившегося игрока доигрывает робот (во время партии) или место освобождается (в лобби) */
  'room:replaceWithBot': (payload: { playerId: string }, ack: (r: Ack) => void) => void;
  'room:react': (payload: { emoji: Reaction }, ack: (r: Ack) => void) => void;
  'game:roll': (payload: { expectedVersion: number }, ack: (r: Ack<GameUpdate>) => void) => void;
  'game:choose': (payload: { actionId: string; expectedVersion: number }, ack: (r: Ack<GameUpdate>) => void) => void;
}

/** Сервер → клиент. */
export interface ServerToClientEvents {
  'room:state': (room: RoomSnapshot) => void;
  'game:update': (update: GameUpdate) => void;
  'room:reaction': (reaction: ReactionEvent) => void;
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
