import { CORNERS } from '@blokha/game-engine';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { BotLevel } from '@blokha/game-engine';
import { BOT_LEVELS } from './SetupScreen';
import { CORNER_INFO, PIECE_SETS, PLAYER_COLORS, cornerName, cornerTitle } from '../game/pieceSets';
import { AVATARS } from '@blokha/shared';
import { LEAGUE_INFO } from '../game/account';
import { Avatar } from './Avatar';
import { CornerIcon } from './CornerIcon';
import type { OnlineGame } from '../game/useOnlineGame';
import { PieceGlyph } from './Board';

export function inviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

export function LobbyScreen({ online, onLeave, onInviteFriends }: { online: OnlineGame; onLeave: () => void; onInviteFriends?: (() => void) | undefined }) {
  const room = online.room!;
  const me = room.seats.find((s) => s.playerId === online.myPlayerId);
  const isHost = room.hostId === online.myPlayerId;
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string>('');
  useEffect(() => {
    QRCode.toDataURL(inviteLink(room.code), { margin: 1, width: 220, color: { dark: '#1b1512', light: '#f4ebdd' } }).then(setQr).catch(() => setQr(''));
  }, [room.code]);
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
        <div className="ml-auto flex gap-2">
          {onInviteFriends && <button type="button" onClick={onInviteFriends} className="px-3 py-2 rounded-lg bg-sky-600 text-white font-bold text-sm" data-testid="invite-friends">👥 Позвать друзей</button>}
          <button type="button" onClick={copy} className="px-4 py-2 rounded-lg bg-stone-700 font-bold text-sm">
            {copied ? 'Скопировано ✓' : 'Скопировать ссылку'}
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3">
        {qr && <img src={qr} alt="QR-код ссылки на комнату" className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg" data-testid="qr" />}
        <div className="text-xs min-w-0" style={{ color: 'var(--muted)' }}>
          <div>Наведите камеру телефона на QR-код или отправьте ссылку:</div>
          <div className="break-all mt-1">{inviteLink(room.code)}</div>
          {room.gamesPlayed > 0 && (
            <div className="mt-2 text-amber-300">Счёт серии: {room.seats.map((s) => `${s.nickname} ${room.series[s.playerId] ?? 0}`).join(' : ')}</div>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {room.seats.map((seat, i) => {
          const mine = seat.playerId === online.myPlayerId;
          return (
            <div key={seat.playerId} data-testid={`seat-${i}`} className={`rounded-xl p-3 bg-stone-800/70 border-2 ${mine ? 'border-yellow-400' : 'border-stone-700'}`}>
              <div className="flex items-center gap-2">
                <Avatar emoji={seat.avatar} color={seat.color} size={40} />
                <span className="w-9 h-9 inline-block"><PieceGlyph color={seat.color} glyph={seat.pieceSet} index={i + 1} size="small" /></span>
                <span className="font-black truncate">{seat.isBot ? '🤖 ' : ''}{seat.nickname}{mine ? ' (вы)' : ''}</span>
                {seat.isHost && <span className="text-[10px] uppercase tracking-wide bg-yellow-400/20 text-yellow-300 px-1.5 rounded">хозяин</span>}
                {seat.league && <span className="text-[11px]" title={`${LEAGUE_INFO[seat.league]?.title} · рейтинг ${seat.rating}`}>{LEAGUE_INFO[seat.league]?.icon} {seat.rating}</span>}
                {!seat.connected && !seat.isBot && <span className="text-[10px] uppercase tracking-wide bg-rose-900/50 text-rose-300 px-1.5 rounded">офлайн</span>}
                <span className="ml-auto text-sm text-stone-400 inline-flex items-center gap-1" title={cornerTitle(seat.corner)}><CornerIcon corner={seat.corner} color={seat.color} /> {cornerName(seat.corner)}</span>
                {seat.isBot && isHost && (
                  <>
                    <select
                      value={seat.botLevel ?? 'normal'}
                      onChange={(e) => online.setBotLevel(seat.playerId, e.target.value as BotLevel)}
                      aria-label="Уровень робота"
                      className="bg-stone-900 rounded-md px-1.5 py-1 text-xs font-bold"
                    >
                      {BOT_LEVELS.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => online.removeBot(seat.playerId)} className="text-xs text-rose-300 hover:text-rose-100">убрать</button>
                  </>
                )}
                {seat.isBot && !isHost && <span className="text-xs" style={{ color: 'var(--muted)' }}>{BOT_LEVELS.find((l) => l.id === seat.botLevel)?.name}</span>}
                {!seat.isBot && !seat.connected && isHost && !mine && (
                  <button type="button" onClick={() => online.replaceWithBot(seat.playerId)} className="text-xs text-rose-300 hover:text-rose-100">убрать</button>
                )}
              </div>
              {mine && me && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs mr-1" style={{ color: 'var(--muted)' }}>Угол</span>
                    {CORNERS.map((c) => {
                      const taken = room.seats.some((s) => s.playerId !== me.playerId && s.corner === c);
                      return (
                        <button
                          key={c}
                          type="button"
                          disabled={taken}
                          onClick={() => online.updateSeat({ corner: c })}
                          title={taken ? 'Этот угол уже занят' : cornerTitle(c)}
                          className={`h-9 px-2 rounded-md text-sm font-bold inline-flex items-center gap-1 ${me.corner === c ? 'bg-yellow-400 text-stone-900' : taken ? 'bg-stone-900 text-stone-600 cursor-not-allowed' : 'bg-stone-700'}`}
                        >
                          <CornerIcon corner={c} color={taken ? 'currentColor' : me.corner === c ? '#1c1917' : me.color} />
                          {CORNER_INFO[c].num}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1" role="radiogroup" aria-label="Набор фигур">
                    <span className="text-xs mr-1" style={{ color: 'var(--muted)' }}>Фигуры</span>
                    {PIECE_SETS.map((s) => (
                      <button key={s.id} type="button" role="radio" aria-checked={me.pieceSet === s.id} title={s.name} onClick={() => online.updateSeat({ pieceSet: s.id })} className={`w-9 h-9 rounded-md text-xl leading-none ${me.pieceSet === s.id ? 'bg-yellow-400 text-stone-900' : 'bg-stone-700 text-stone-200'}`}>
                        {s.glyph}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 flex-wrap" role="radiogroup" aria-label="Аватар">
                    <span className="text-xs mr-1" style={{ color: 'var(--muted)' }}>Аватар</span>
                    {AVATARS.map((a) => (
                      <button key={a} type="button" role="radio" aria-checked={me.avatar === a} onClick={() => online.updateSeat({ avatar: a })} className={`w-8 h-8 rounded-lg text-lg ${me.avatar === a ? 'bg-yellow-400' : 'bg-stone-700'}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs mr-1" style={{ color: 'var(--muted)' }}>Цвет</span>
                    {PLAYER_COLORS.map((c) => (
                      <button key={c.id} type="button" aria-label={c.name} onClick={() => online.updateSeat({ color: c.id })} className={`w-7 h-7 rounded-full ${me.color === c.id ? 'ring-2 ring-white ring-offset-2 ring-offset-stone-800' : ''}`} style={{ background: c.id }} />
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
              <div className="ml-auto flex gap-1">
                {BOT_LEVELS.map((l) => (
                  <button key={l.id} type="button" data-testid={l.id === 'normal' ? 'add-bot' : `add-bot-${l.id}`} onClick={() => online.addBot(l.id)} className="px-2.5 py-1.5 rounded-lg bg-sky-600 text-white font-bold text-xs" title={`Добавить робота: ${l.name}`}>
                    + 🤖 {l.name}
                  </button>
                ))}
              </div>
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
