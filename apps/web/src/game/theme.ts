export type Theme = 'wood' | 'light' | 'modern';
export const THEMES: Theme[] = ['wood', 'light', 'modern'];
export const THEME_NAMES: Record<Theme, string> = { wood: 'Classic Wood', light: 'Светлая', modern: 'Modern' };

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
