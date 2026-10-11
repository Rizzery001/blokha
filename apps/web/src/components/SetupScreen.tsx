import { CORNERS, type Corner } from '@blokha/game-engine';
import type { LocalPlayerSetup } from '../game/useLocalGame';
import { useState } from 'react';
import { PIECE_SETS, PLAYER_COLORS } from '../game/pieceSets';
import { PieceGlyph } from './Board';

interface Row {
  nickname: string;
  corner: Corner;
  pieceSet: string;
  color: string;
  isBot: boolean;
}

const DEFAULT_ROWS: Row[] = [
  { nickname: 'Игрок 1', corner: 'A1', pieceSet: 'pawn', color: PLAYER_COLORS[0]!.id, isBot: false },
  { nickname: 'Робот Шура', corner: 'H8', pieceSet: 'knight', color: PLAYER_COLORS[1]!.id, isBot: true },
  { nickname: 'Робот Кеша', corner: 'H1', pieceSet: 'rook', color: PLAYER_COLORS[2]!.id, isBot: true },
  { nickname: 'Робот Фима', corner: 'A8', pieceSet: 'bishop', color: PLAYER_COLORS[3]!.id, isBot: true },
];

export function buildPlayers(rows: Row[]): LocalPlayerSetup[] {
  return rows.map((r, i) => ({ id: `p${i + 1}`, nickname: r.nickname.trim() || `Игрок ${i + 1}`, corner: r.corner, pieceSet: r.pieceSet, color: r.color, isBot: r.isBot }));
}

export function SetupScreen({ onStart, onBack }: { onStart: (players: LocalPlayerSetup[]) => void; onBack: () => void }) {
  const [count, setCount] = useState(2);
  const [rows, setRows] = useState<Row[]>(DEFAULT_ROWS);
  const active = rows.slice(0, count);
  const cornerDup = new Set(active.map((r) => r.corner)).size !== active.length;
  const update = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)));

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <button type="button" onClick={onBack} className="text-stone-400 hover:text-white text-sm">← Назад</button>
      <h2 className="text-2xl sm:text-3xl font-black mt-2">Локальная партия</h2>
      <p className="text-stone-400 text-sm mt-1">Все игроки за одним устройством. Любое место можно отдать роботу. Очередность — по порядку в списке.</p>

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
          <div key={i} className="rounded-xl bg-stone-800/70 p-3 grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto_auto] gap-2 items-center">
            <span className="w-10 h-10 inline-block"><PieceGlyph color={row.color} glyph={row.pieceSet} index={i + 1} size="small" /></span>
            <div className="flex items-center gap-2 min-w-0">
            <input
              data-testid={`nick-${i}`}
              value={row.nickname}
              maxLength={20}
              onChange={(e) => update(i, { nickname: e.target.value })}
              className="bg-stone-900 rounded-lg px-3 py-2 text-base font-bold outline-none focus:ring-2 ring-yellow-400 min-w-0 flex-1"
            />
            <button
              type="button"
              data-testid={`bot-${i}`}
              onClick={() => update(i, { isBot: !row.isBot })}
              className={`shrink-0 px-2.5 py-2 rounded-lg text-sm font-bold ${row.isBot ? 'bg-sky-500 text-white' : 'bg-stone-700 text-stone-300'}`}
              title="Этим местом играет робот"
            >
              {row.isBot ? '🤖 Робот' : '🙂 Человек'}
            </button>
            </div>
            <div className="flex gap-1 col-span-2 sm:col-span-1">
              {CORNERS.map((c) => {
                const taken = active.some((r, k) => k !== i && r.corner === c);
                return (
                  <button
                    key={c}
                    type="button"
                    data-testid={`corner-${i}-${c}`}
                    onClick={() => update(i, { corner: c })}
                    className={`px-2 py-1.5 rounded-md text-sm font-bold ${row.corner === c ? 'bg-yellow-400 text-stone-900' : taken ? 'bg-stone-900 text-stone-600' : 'bg-stone-700'}`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1 col-span-2 sm:col-span-1 flex-wrap">
              <div className="flex gap-0.5" role="radiogroup" aria-label="Набор фигур">
                {PIECE_SETS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={row.pieceSet === s.id}
                    title={s.name}
                    onClick={() => update(i, { pieceSet: s.id })}
                    className={`w-8 h-8 rounded-md text-xl leading-none ${row.pieceSet === s.id ? 'bg-yellow-400 text-stone-900' : 'bg-stone-700 text-stone-200'}`}
                  >
                    {s.glyph}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {PLAYER_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={c.name}
                    onClick={() => update(i, { color: c.id })}
                    className={`w-6 h-6 rounded-full ${row.color === c.id ? 'ring-2 ring-white' : ''}`}
                    style={{ background: c.id }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
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
