/**
 * Объёмные силуэты фигур (viewBox 0 0 100 120). Форма — только косметика, по правилам все фигуры одинаковы.
 * Рисуются одним цветом игрока с градиентной подсветкой и тёмным контуром.
 */
const SHAPES: Record<string, string> = {
  // пешка: шар, шейка, воротник, конус, основание
  pawn: 'M50 14a13 13 0 1 1-.1 0zM40 40h20l4 9H36zM44 49h12c0 18 6 30 14 40H30c8-10 14-22 14-40zM22 92h56c6 0 8 4 8 9v4H14v-4c0-5 2-9 8-9z',
  // ладья: зубцы, башня, пояс, основание
  rook: 'M22 14h12v10h10V14h12v10h10V14h12v22H22zM30 38h40l-3 10H33zM34 50h32l4 40H30zM22 92h56c6 0 8 4 8 9v4H14v-4c0-5 2-9 8-9z',
  // конь: голова с гривой, шея, основание
  knight: 'M34 92c-2-16 2-30 14-40 4-4 4-10 2-14l-6-6c-1-5 3-9 8-11 2-4 6-6 10-5 5 1 8 4 12 5l6 4c4 3 6 8 6 14 0 8-4 14-8 20-6 9-10 18-11 33H34zM56 36a3 3 0 1 1-.1 0zM44 37l-10 10c-3 3-8 2-9-2l4-9c4-3 9-4 15 1z M22 92h56c6 0 8 4 8 9v4H14v-4c0-5 2-9 8-9z',
  // слон: митра с прорезью, шар, тело
  bishop: 'M50 10a6 6 0 1 1-.1 0zM50 20c14 10 20 24 20 38 0 8-6 14-20 14S30 66 30 58c0-14 6-28 20-38zM46 32l12 14-4 4-12-14zM36 72h28l4 10H32zM34 82h32l4 10H30zM22 92h56c6 0 8 4 8 9v4H14v-4c0-5 2-9 8-9z',
  // ферзь: корона с шариками, тело, пояс
  queen: 'M20 24a6 6 0 1 1-.1 0zM35 14a6 6 0 1 1-.1 0zM50 10a6 6 0 1 1-.1 0zM65 14a6 6 0 1 1-.1 0zM80 24a6 6 0 1 1-.1 0zM22 30l13-10 15 12 15-12 13 10-8 30H30zM32 60h36l4 10H28zM30 70h40l4 22H26zM22 92h56c6 0 8 4 8 9v4H14v-4c0-5 2-9 8-9z',
  // король: крест, корона, тело
  king: 'M46 6h8v8h8v8h-8v8h-8v-8h-8v-8h8zM30 30h40l6 14-10 20H34L24 44zM32 64h36l4 10H28zM30 74h40l4 18H26zM22 92h56c6 0 8 4 8 9v4H14v-4c0-5 2-9 8-9z',
};

let uid = 0;

export function PieceShape({ kind, color, className }: { kind: string; color: string; className?: string }) {
  const d = SHAPES[kind] ?? SHAPES['pawn']!;
  const id = `pg${(uid = (uid + 1) % 100000)}`;
  return (
    <svg viewBox="0 0 100 120" className={className} aria-hidden style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.45" stopColor={color} stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <path d={d} fill={color} stroke="rgba(20,10,0,0.55)" strokeWidth="4" strokeLinejoin="round" />
      <path d={d} fill={`url(#${id})`} />
    </svg>
  );
}
