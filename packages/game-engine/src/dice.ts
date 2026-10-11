/**
 * Источники случайности. В онлайн-режиме бросок делает только сервер (crypto.randomInt);
 * в локальном режиме используем Web Crypto, если доступен.
 */
export type DiceRoller = () => number;

export function createCryptoDiceRoller(sides = 6): DiceRoller {
  return () => {
    const g = globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } };
    if (g.crypto?.getRandomValues) {
      // Отбрасываем значения, дающие смещение
      const limit = Math.floor(0x100000000 / sides) * sides;
      const buf = new Uint32Array(1);
      let v: number;
      do {
        g.crypto.getRandomValues(buf);
        v = buf[0]!;
      } while (v >= limit);
      return (v % sides) + 1;
    }
    return Math.floor(Math.random() * sides) + 1;
  };
}

/** Детерминированный кубик для тестов и воспроизведения партий. */
export function createSequenceDiceRoller(values: number[]): DiceRoller {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    if (v === undefined) throw new Error('Empty dice sequence');
    return v;
  };
}
