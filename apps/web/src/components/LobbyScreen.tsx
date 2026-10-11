import { CORNERS } from '@blokha/game-engine';
import { useState } from 'react';
import { PIECE_SETS, PLAYER_COLORS } from '../game/pieceSets';
import type { OnlineGame } from '../game/useOnlineGame';
import { PieceGlyph } from './Board';

export function inviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

export function LobbyScreen({ online, onLeave }: { online: OnlineGame; onLeave: () => void }) {
  const room = online.room!;
  const me = room.seats.find((s) => s.playerId === online.myPlayerId);
  const isHost = room.hostId === online.myPlayerId;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(room.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };
  const canStart = isHost && room.seats.length >= 2;

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onLeave} className="text-stone-400 hover:text-white text-sm">← Покинуть комнату</button>
        <span className={`text-xs ${online.conn === 'connected' ? 'text-emerald-300' : 'text-rose-300'}`}>● {online.conn === 'connected' ? 'на связи' : 'нет связи'}</span>
      </div>
      <h2 className="text-2xl sm:text-3xl font-black mt-2">Лобби</h2>
      <div className="mt-3 rounded-xl bg-stone-800/70 p-4 flex flex-wrap items-center gap-3">
        <div>
          <div className="text-xs text-stone-400">Код комнаты</div>
          <div className="text-3xl font-black tracking-[0.3em]" data-testid="room-code">{room.code}</div>
        </div>
        <button type="button" onClick={copy} className="ml-auto px-4 py-2 rounded-lg bg-stone-700 font-bold text-sm">
          {copied ? 'Скопировано ✓' : 'Скопировать ссылку'}
        </button>
      </div>
      <p className="text-stone-400 text-xs mt-2 break-all">{inviteLink(room.code)}</p>

      <div className="mt-4 space-y-2">
        {room.seats.map((seat, i) => {
          const mine = seat.playerId === online.myPlayerId;
          return (
            <div key={seat.playerId} data-testid={`seat-${i}`} className={`rounded-xl p-3 bg-stone-800/70 border-2 ${mine ? 'border-yellow-400' : 'border-stone-700'}`}>
              <div className="flex items-center gap-2">
                <PieceGlyph color={seat.color} glyph={PIECE_SETS.find((p) => p.id === seat.pieceSet)?.glyph ?? '●'} index={i + 1} size="small" />
                <span className="font-black truncate">{seat.isBot ? '🤖 ' : ''}{seat.nickname}{mine ? ' (вы)' : ''}</span>
                {seat.isHost && <span className="text-[10px] uppercase tracking-wide bg-yellow-400/20 text-yellow-300 px-1.5 rounded">хозяин</span>}
                {!seat.connected && !seat.isBot && <span className="text-[10px] uppercase tracking-wide bg-rose-900/50 text-rose-300 px-1.5 rounded">офлайн</span>}
                <span className="ml-auto text-sm text-stone-400">угол {seat.corner}</span>
                {seat.isBot && isHost && (
                  <button type="button" onClick={() => online.removeBot(seat.playerId)} className="text-xs text-rose-300 hover:text-rose-100">убрать</button>
                )}
              </div>
              {mine && me && (
                <div className="mt-2 flex flex-wrap gap-2 items-center">
                  <div className="flex gap-1">
                    {CORNERS.map((c) => {
                      const taken = room.seats.some((s) => s.playerId !== me.playerId && s.corner === c);
                      return (
                        <button
                          key={c}
                          type="button"
                          disabled={taken}
                          onClick={() => online.updateSeat({ corner: c })}
                          className={`px-2 py-1.5 rounded-md text-sm font-bold ${me.corner === c ? 'bg-yellow-400 text-stone-900' : taken ? 'bg-stone-900 text-stone-600' : 'bg-stone-700'}`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                  <select value={me.pieceSet} onChange={(e) => online.updateSeat({ pieceSet: e.target.value })} className="bg-stone-900 rounded-md px-2 py-1.5 text-sm" aria-label="Набор фигур">
                    {PIECE_SETS.map((s) => (
                      <option key={s.id} value={s.id}>{s.glyph} {s.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-1">
                    {PLAYER_COLORS.map((c) => (
                      <button key={c.id} type="button" aria-label={c.name} onClick={() => online.updateSeat({ color: c.id })} className={`w-6 h-6 rounded-full ${me.color === c.id ? 'ring-2 ring-white' : ''}`} style={{ background: c.id }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {room.seats.length < 4 && (
          <div className="rounded-xl p-3 border-2 border-dashed border-stone-700 text-stone-500 text-sm flex items-center gap-3">
            Свободное место — отправьте ссылку другу
            {isHost && (
              <button type="button" data-testid="add-bot" onClick={() => online.addBot()} className="ml-auto px-3 py-1.5 rounded-lg bg-sky-600 text-white font-bold text-sm">+ Робот</button>
            )}
          </div>
        )}
      </div>

      {online.error && <div className="mt-3 rounded-lg bg-rose-900/70 text-rose-100 text-sm px-3 py-2">{online.error}</div>}
      <div className="mt-5">
        {isHost ? (
          <button type="button" data-testid="start-online" disabled={!canStart} onClick={() => online.start()} className="w-full sm:w-auto px-8 py-3 rounded-xl bg-yellow-400 text-stone-900 font-black text-lg disabled:opacity-40 shadow-[0_5px_0_#b08900] active:translate-y-0.5">
            Начать партию
          </button>
        ) : (
          <div className="text-stone-400 text-sm">Ждём, когда хозяин комнаты начнёт партию…</div>
        )}
      </div>
    </div>
  );
}
