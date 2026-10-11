const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [0, 2], [2, 0], [2, 2]],
  5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
  6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
};

export function Dice({ value, rolling }: { value: number | null; rolling: boolean }) {
  const v = value ?? 6;
  return (
    <div
      className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-white to-stone-200 shadow-[0_8px_0_#a8a29e,0_12px_18px_rgba(0,0,0,0.45)] grid grid-cols-3 grid-rows-3 p-2.5 transition-transform ${rolling ? 'animate-[spin_0.65s_ease-in-out]' : ''}`}
      data-testid="dice"
      aria-label={value ? `Кубик: ${value}` : 'Кубик'}
    >
      {Array.from({ length: 9 }, (_, i) => {
        const r = Math.floor(i / 3);
        const c = i % 3;
        const on = !rolling && PIPS[v]!.some(([pr, pc]) => pr === r && pc === c);
        return <div key={i} className={`m-auto w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${on ? 'bg-stone-900' : 'bg-transparent'}`} />;
      })}
    </div>
  );
}
