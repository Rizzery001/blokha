const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// ориентация куба, при которой нужная грань смотрит на зрителя
const ROTATION: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(-90deg) rotateY(0deg)',
  3: 'rotateX(0deg) rotateY(-90deg)',
  4: 'rotateX(0deg) rotateY(90deg)',
  5: 'rotateX(90deg) rotateY(0deg)',
  6: 'rotateX(180deg) rotateY(0deg)',
};
// размещение граней: 1 спереди, 6 сзади, 2 сверху, 5 снизу, 3 справа, 4 слева
const FACE_TRANSFORM: Record<number, string> = {
  1: 'rotateY(0deg)',
  6: 'rotateY(180deg)',
  2: 'rotateX(90deg)',
  5: 'rotateX(-90deg)',
  3: 'rotateY(90deg)',
  4: 'rotateY(-90deg)',
};

export function Dice({ value, rolling }: { value: number | null; rolling: boolean }) {
  const v = value ?? 6;
  return (
    <div className="flex flex-col items-center" data-testid="dice" aria-label={value ? `Кубик: ${value}` : 'Кубик'}>
      <div className="dice-scene">
        <div className={`dice-cube ${rolling ? 'spinning' : ''}`} style={{ transform: rolling ? undefined : ROTATION[v] }}>
          {[1, 2, 3, 4, 5, 6].map((f) => (
            <div key={f} className="dice-face" style={{ transform: `${FACE_TRANSFORM[f]} translateZ(calc(var(--half, 34px)))` }}>
              {Array.from({ length: 9 }, (_, i) => (
                <div key={i} className={PIPS[f]!.includes(i) ? 'pip' : ''} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="dice-shadow" />
    </div>
  );
}
