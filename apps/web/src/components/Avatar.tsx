/** Аватар игрока: эмодзи на диске цвета игрока. */
export function Avatar({ emoji, color, size = 36, active = false }: { emoji: string; color: string; size?: number; active?: boolean }) {
  return (
    <span
      className={`avatar ${active ? 'avatar-active' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.56, ['--pc' as string]: color }}
      aria-hidden
    >
      {emoji}
    </span>
  );
}
