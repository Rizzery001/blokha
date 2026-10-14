export type Theme = 'wood' | 'light' | 'modern' | 'marble' | 'felt' | 'neon' | 'gold';
export const THEMES: Theme[] = ['wood', 'light', 'modern', 'marble', 'felt', 'neon', 'gold'];
export const THEME_NAMES: Record<Theme, string> = { wood: 'Классическое дерево', light: 'Дневной свет', modern: 'Modern', marble: 'Мрамор', felt: 'Зелёное сукно', neon: 'Неон', gold: 'Золотая доска' };

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem('blokha.theme');
    return THEMES.includes(v as Theme) ? (v as Theme) : 'wood';
  } catch {
    return 'wood';
  }
}
export function nextTheme(t: Theme): Theme {
  return THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]!;
}
