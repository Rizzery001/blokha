/**
 * Каталог косметики: доски, наборы фигур, аватары, рамки профиля. Предмет = `${kind}:${id}`.
 * Условия открытия: base (всегда), achievement (достижение за всё время), chest (из сундуков), premium.
 */
export type ItemKind = 'board' | 'pieceSet' | 'avatar' | 'frame';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Item {
  kind: ItemKind;
  id: string;
  title: string;
  lore: string;
  rarity: Rarity;
  /** как открыть: base — всегда; chest — выпадает из сундуков; achievement — через достижение (см. profile.LIFETIME); premium — только премиум */
  source: 'base' | 'chest' | 'achievement' | 'premium';
}

export const BOARDS: Item[] = [
  { kind: 'board', id: 'wood', title: 'Классическое дерево', lore: 'Та самая доска из шкафа: берёза, морёный лак и выжженные подписи клеток. С неё всё началось.', rarity: 'common', source: 'base' },
  { kind: 'board', id: 'light', title: 'Дневной свет', lore: 'Кремовый стол у окна, воскресное утро, чай и доска посередине.', rarity: 'common', source: 'base' },
  { kind: 'board', id: 'modern', title: 'Modern', lore: 'Холодный синий, аккуратные грани. Та же игра, но как будто из будущего.', rarity: 'rare', source: 'achievement' },
  { kind: 'board', id: 'marble', title: 'Мрамор', lore: 'Белый каррарский мрамор и тёмный змеевик. Для тех, кто играет с серьёзным лицом.', rarity: 'rare', source: 'chest' },
  { kind: 'board', id: 'felt', title: 'Зелёное сукно', lore: 'Казино, лампа над столом и шёпот «ну давай же, шесть!».', rarity: 'rare', source: 'chest' },
  { kind: 'board', id: 'neon', title: 'Неон', lore: 'Аркада восьмидесятых: фиолетовый свет, розовые линии, синтезаторы в голове.', rarity: 'epic', source: 'chest' },
  { kind: 'board', id: 'gold', title: 'Золотая доска', lore: 'Для чемпионов. Блестит так, что соперники щурятся.', rarity: 'legendary', source: 'premium' },
];

export const PIECE_SET_ITEMS: Item[] = [
  { kind: 'pieceSet', id: 'pawn', title: 'Пешки', lore: 'Скромные, но доходят до конца.', rarity: 'common', source: 'base' },
  { kind: 'pieceSet', id: 'knight', title: 'Кони', lore: 'Ходят как все, но выглядят лихо.', rarity: 'common', source: 'base' },
  { kind: 'pieceSet', id: 'rook', title: 'Ладьи', lore: 'Крепости на колёсах.', rarity: 'common', source: 'base' },
  { kind: 'pieceSet', id: 'bishop', title: 'Слоны', lore: 'Высокие, стройные, слегка надменные.', rarity: 'common', source: 'base' },
  { kind: 'pieceSet', id: 'queen', title: 'Ферзи', lore: 'Четыре ферзя на одной доске. Кто сказал, что так нельзя?', rarity: 'rare', source: 'achievement' },
  { kind: 'pieceSet', id: 'king', title: 'Короли', lore: 'Корона не спасает от выбивания, но смотрится солидно.', rarity: 'epic', source: 'achievement' },
];

export const FRAMES: Item[] = [
  { kind: 'frame', id: 'none', title: 'Без рамки', lore: '', rarity: 'common', source: 'base' },
  { kind: 'frame', id: 'bronze', title: 'Бронзовая рамка', lore: 'Первые победы уже за плечами.', rarity: 'common', source: 'chest' },
  { kind: 'frame', id: 'silver', title: 'Серебряная рамка', lore: 'Серьёзный игрок.', rarity: 'rare', source: 'chest' },
  { kind: 'frame', id: 'gold', title: 'Золотая рамка', lore: 'Все знают, кто за этим столом главный.', rarity: 'epic', source: 'chest' },
  { kind: 'frame', id: 'laurel', title: 'Лавровый венок', lore: 'Чемпион недели. Носить гордо.', rarity: 'legendary', source: 'chest' },
  { kind: 'frame', id: 'premium', title: 'Премиум-рамка', lore: 'Для тех, кто поддержал игру.', rarity: 'legendary', source: 'premium' },
];

export const CHEST_AVATARS: Item[] = ['🦖', '🐳', '🦜', '🍄', '🎃', '👽', '🧸', '🍩', '🏆', '🧿'].map((a, i) => ({ kind: 'avatar' as const, id: a, title: `Аватар ${a}`, lore: '', rarity: (i < 5 ? 'common' : i < 8 ? 'rare' : 'epic') as Rarity, source: 'chest' as const }));

export const ALL_ITEMS: Item[] = [...BOARDS, ...PIECE_SET_ITEMS, ...FRAMES, ...CHEST_AVATARS];
export const itemKey = (i: Item) => `${i.kind}:${i.id}`;
export const RARITY_LABEL: Record<Rarity, string> = { common: 'обычный', rare: 'редкий', epic: 'эпический', legendary: 'легендарный' };
export const RARITY_COLOR: Record<Rarity, string> = { common: '#9ca3af', rare: '#38bdf8', epic: '#a78bfa', legendary: '#f2c230' };

/** Награда из сундука: случайный предмет из chest-источника с весами по редкости; дубликат → опыт. */
export function rollChest(owned: Set<string>, random: () => number = Math.random): { item: Item; duplicate: boolean; xp: number } {
  const pool = ALL_ITEMS.filter((i) => i.source === 'chest');
  const weight: Record<Rarity, number> = { common: 60, rare: 28, epic: 10, legendary: 2 };
  const fresh = pool.filter((i) => !owned.has(itemKey(i)));
  const candidates = fresh.length > 0 && random() < 0.85 ? fresh : pool;
  const total = candidates.reduce((a, i) => a + weight[i.rarity], 0);
  let r = random() * total;
  let item = candidates[candidates.length - 1]!;
  for (const i of candidates) {
    r -= weight[i.rarity];
    if (r <= 0) {
      item = i;
      break;
    }
  }
  const duplicate = owned.has(itemKey(item));
  const dupXp: Record<Rarity, number> = { common: 25, rare: 50, epic: 100, legendary: 200 };
  return { item, duplicate, xp: duplicate ? dupXp[item.rarity] : 0 };
}
