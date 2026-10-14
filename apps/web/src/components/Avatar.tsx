/** Аватар игрока: эмодзи на диске цвета игрока. */
export function Avatar({ emoji, color, size = 36, active = false, frame = 'none' }: { emoji: string; color: string; size?: number; active?: boolean; frame?: string }) {
  return (
    <span
      className={`avatar ${active ? 'avatar-active' : ''} ${frame && frame !== 'none' ? `frame-${frame}` : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.56, ['--pc' as string]: color }}
      aria-hidden
    >
      {emoji}
    </span>
  );
}
