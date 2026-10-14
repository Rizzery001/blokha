import { CORNERS, type BotLevel, type Corner } from '@blokha/game-engine';
import { AVATARS, BOT_AVATARS } from '@blokha/shared';
import { Avatar } from './Avatar';
import { getProfile, loadStore, unlockHint, unlockedCosmetics } from '../game/profile';
import type { LocalPlayerSetup } from '../game/useLocalGame';
import { useState } from 'react';
import { CORNER_INFO, PIECE_SETS, PLAYER_COLORS, cornerTitle } from '../game/pieceSets';
import { CornerIcon } from './CornerIcon';

export const BOT_LEVELS: { id: BotLevel; name: string }[] = [
  { id: 'easy', name: 'Простой' },
  { id: 'normal', name: 'Обычный' },
  { id: 'hard', name: 'Сильный' },
];

interface Row {
  nickname: string;
  corner: Corner;
  pieceSet: string;
  color: string;
  isBot: boolean;
  botLevel: BotLevel;
  avatar: string;
}

const DEFAULT_ROWS: Row[] = [
  { nickname: 'Игрок 1', corner: 'A1', pieceSet: 'pawn', color: PLAYER_COLORS[0]!.id, isBot: false, botLevel: 'normal', avatar: '🦊' },
  { nickname: 'Робот Шура', corner: 'H8', pieceSet: 'knight', color: PLAYER_COLORS[1]!.id, isBot: true, botLevel: 'normal', avatar: '🤖' },
  { nickname: 'Робот Кеша', corner: 'H1', pieceSet: 'rook', color: PLAYER_COLORS[2]!.id, isBot: true, botLevel: 'easy', avatar: '👾' },
  { nickname: 'Робот Фима', corner: 'A8', pieceSet: 'bishop', color: PLAYER_COLORS[3]!.id, isBot: true, botLevel: 'hard', avatar: '🛸' },
];

export function buildPlayers(rows: Row[]): LocalPlayerSetup[] {
  return rows.map((r, i) => ({ id: `p${i + 1}`, nickname: r.nickname.trim() || `Игрок ${i + 1}`, corner: r.corner, pieceSet: r.pieceSet, color: r.color, isBot: r.isBot, botLevel: r.botLevel, avatar: r.avatar }));
}

export function SetupScreen({ onStart, onBack, initialRows, onStake }: { onStart: (players: LocalPlayerSetup[]) => void; onBack: () => void; initialRows?: LocalPlayerSetup[] | undefined; onStake?: ((s: string) => void) | undefined }) {
  const store = loadStore();
  const unlockedFor = (nick: string) => unlockedCosmetics(store.profiles[nick.trim().toLowerCase()] ?? null);
  const [stake, setStake] = useState('');
  const [count, setCount] = useState(initialRows?.length ?? 2);
  const [rows, setRows] = useState<Row[]>(() => initialRows ? initialRows.map((p, i) => ({ nickname: p.nickname, corner: p.corner, pieceSet: p.pieceSet ?? 'pawn', color: p.color ?? DEFAULT_ROWS[i]!.color, isBot: !!p.isBot, botLevel: p.botLevel ?? 'normal', avatar: p.avatar ?? '🦊' })).concat(DEFAULT_ROWS.slice(initialRows.length)) : DEFAULT_ROWS);
  const [avatarPicker, setAvatarPicker] = useState<number | null>(null);
  const active = rows.slice(0, count);
  const cornerDup = new Set(active.map((r) => r.corner)).size !== active.length;
  const update = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <button type="button" onClick={onBack} className="text-stone-400 hover:text-white text-sm">← Назад</button>
      <h2 className="text-2xl sm:text-3xl font-black mt-2">Локальная партия</h2>
      <p className="text-stone-400 text-sm mt-1">Все игроки за одним устройством. Любое место можно отдать роботу. Очередность — по порядку в списке. Угол — откуда стартуют фигуры: 1 слева внизу, 2 справа внизу, 3 справа вверху, 4 слева вверху.</p>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-sm">Игроков:</span>
        {[2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            data-testid={`count-${n}`}
            onClick={() => setCount(n)}
            className={`w-10 h-10 rounded-lg font-black ${count === n ? 'bg-yellow-400 text-stone-900' : 'bg-stone-700'}`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {active.map((row, i) => (
          <div key={i} className="panel rounded-xl p-3 flex flex-col gap-3" style={{ borderLeft: `5px solid ${row.color}` }} data-testid={`player-row-${i}`}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setAvatarPicker(avatarPicker === i ? null : i)} className="shrink-0" title="Выбрать аватар" aria-label="Выбрать аватар" data-testid={`avatar-${i}`}>
                <Avatar emoji={row.avatar} color={row.color} size={40} />
              </button>
              <input
                data-testid={`nick-${i}`}
                value={row.nickname}
                maxLength={20}
                onChange={(e) => update(i, { nickname: e.target.value })}
                aria-label="Имя игрока"
                className="flex-1 min-w-0 bg-stone-900 rounded-lg px-3 py-2 text-base font-bold outline-none focus:ring-2 ring-yellow-400"
              />
              {row.isBot && (
                <select
                  value={row.botLevel}
                  onChange={(e) => update(i, { botLevel: e.target.value as BotLevel })}
                  aria-label="Уровень робота"
                  data-testid={`bot-level-${i}`}
                  className="shrink-0 bg-stone-900 rounded-lg px-2 py-2 text-sm font-bold"
                >
                  {BOT_LEVELS.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                data-testid={`bot-${i}`}
                onClick={() => update(i, { isBot: !row.isBot, avatar: !row.isBot ? '🤖' : AVATARS[i % AVATARS.length]! })}
                className={`shrink-0 px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${row.isBot ? 'bg-sky-500 text-white' : 'bg-stone-700 text-stone-200'}`}
                title="Кем играет это место"
              >
                {row.isBot ? '🤖 Робот' : '🙂 Человек'}
              </button>
            </div>
            {avatarPicker === i && (
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Аватар">
                {[...(row.isBot ? BOT_AVATARS : []), ...AVATARS].map((a) => {
                  const locked = !row.isBot && !unlockedFor(row.nickname).avatars.has(a);
                  return (
                    <button key={a} type="button" role="radio" aria-checked={row.avatar === a} disabled={locked} title={locked ? `🔒 ${unlockHint('avatar', a) ?? 'откроется позже'}` : undefined} onClick={() => { update(i, { avatar: a }); setAvatarPicker(null); }} className={`w-9 h-9 rounded-lg text-xl relative ${row.avatar === a ? 'bg-yellow-400' : 'bg-stone-700'} ${locked ? 'opacity-40 grayscale' : ''}`}>
                      {a}
                      {locked && <span className="absolute -right-1 -bottom-1 text-[10px]">🔒</span>}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1">
                <span className="text-xs mr-1" style={{ color: 'var(--muted)' }}>Угол</span>
                {CORNERS.map((c) => {
                  const taken = active.some((r, k) => k !== i && r.corner === c);
                  return (
                    <button
                      key={c}
                      type="button"
                      data-testid={`corner-${i}-${c}`}
                      disabled={taken}
                      onClick={() => update(i, { corner: c })}
                      title={taken ? 'Этот угол уже занят другим игроком' : cornerTitle(c)}
                      className={`h-9 px-2 rounded-md text-sm font-bold inline-flex items-center gap-1 ${row.corner === c ? 'bg-yellow-400 text-stone-900' : taken ? 'bg-stone-900 text-stone-600 cursor-not-allowed' : 'bg-stone-700'}`}
                    >
                      <CornerIcon corner={c} color={taken ? 'currentColor' : row.corner === c ? '#1c1917' : row.color} />
                      {CORNER_INFO[c].num}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Набор фигур">
                <span className="text-xs mr-1" style={{ color: 'var(--muted)' }}>Фигуры</span>
                {PIECE_SETS.map((s) => {
                  const locked = !row.isBot && !unlockedFor(row.nickname).pieceSets.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={row.pieceSet === s.id}
                      disabled={locked}
                      title={locked ? `🔒 ${s.name}: ${unlockHint('pieceSet', s.id) ?? ''}` : s.name}
                      onClick={() => update(i, { pieceSet: s.id })}
                      className={`w-9 h-9 rounded-md text-xl leading-none relative ${row.pieceSet === s.id ? 'bg-yellow-400 text-stone-900' : 'bg-stone-700 text-stone-200'} ${locked ? 'opacity-40' : ''}`}
                    >
                      {s.glyph}
                      {locked && <span className="absolute -right-1 -bottom-1 text-[10px]">🔒</span>}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs mr-1" style={{ color: 'var(--muted)' }}>Цвет</span>
                {PLAYER_COLORS.map((c) => {
                  const used = active.some((r, k) => k !== i && r.color === c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={c.name}
                      title={used ? `${c.name}: уже у другого игрока` : c.name}
                      onClick={() => update(i, { color: c.id })}
                      className={`w-7 h-7 rounded-full ${row.color === c.id ? 'ring-2 ring-white ring-offset-2 ring-offset-stone-800' : used ? 'opacity-30' : ''}`}
                      style={{ background: c.id }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 panel rounded-xl p-3 flex items-center gap-3">
        <span className="text-sm whitespace-nowrap">🎁 Играем на…</span>
        <input value={stake} onChange={(e) => { setStake(e.target.value); onStake?.(e.target.value); }} maxLength={40} placeholder="кто моет посуду (необязательно)" className="flex-1 min-w-0 bg-stone-900 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 ring-yellow-400" data-testid="stake" />
      </div>
      {cornerDup && <p className="mt-3 text-rose-300 text-sm">У каждого игрока должен быть свой угол.</p>}
      <button
        type="button"
        data-testid="start-game"
        disabled={cornerDup}
        onClick={() => onStart(buildPlayers(active))}
        className="mt-5 w-full sm:w-auto px-8 py-3 rounded-xl bg-yellow-400 text-stone-900 font-black text-lg disabled:opacity-40 shadow-[0_5px_0_#b08900] active:translate-y-0.5"
      >
        Начать партию
      </button>
    </div>
  );
}
