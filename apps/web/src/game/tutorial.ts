import type { GameEvent, GameState } from '@blokha/game-engine';

/** Подсказки первой партии: показываются один раз на устройстве, по событиям. */
export interface Hint {
  id: string;
  text: string;
}

export function tutorialHint(e: GameEvent, next: GameState, seen: Record<string, boolean>): Hint | null {
  const lap = next.config.perimeter.length;
  const h = (id: string, text: string) => (seen[id] ? null : { id, text });
  switch (e.type) {
    case 'turnStarted':
      if (next.turnNumber === 1) return h('start', 'Чтобы вывести фигуру из резерва на свой угол, нужно выбросить 6. Пока шестёрки нет, бросок сгорает.');
      return null;
    case 'rolled':
      if (e.sixBonusGranted) return h('six', 'Шестёрка даёт дополнительный бросок. Можно выставить новую фигуру или пойти на 6 клеток уже стоящей.');
      return null;
    case 'spawned':
      return h('spawned', 'Фигуры идут по краю доски по часовой стрелке. Через промежуточные фигуры перепрыгивать нельзя.');
    case 'turnBalance':
      return e.rolls > 0 ? h('bonus', 'Клетки «ход доп.» дают дополнительные броски сразу.') : h('penalty', 'Клетки «пропуск» сначала гасят неиспользованные бонусные броски, остаток — пропуск будущих очередей.');
    case 'moved':
      if (e.kind === 'autoForward') return h('auto', 'Клетки «вперёд» и «назад» двигают фигуру автоматически, если путь свободен.');
      if (e.kind === 'normal') {
        const owner = next.players.find((p) => p.id === e.playerId);
        const piece = owner?.pieces.find((p) => p.id === e.pieceId);
        if (piece && piece.progress === lap) return h('lap', 'Фигура прошла полный круг и вернулась на угол. Теперь она может идти внутрь, по своей диагонали. На углу её ещё можно выбить!');
        if (piece && piece.progress !== null && piece.progress > lap) return h('diag', 'На диагонали нужны точные броски: перелёт через последнюю клетку запрещён. Победа — все четыре фигуры на четырёх клетках диагонали.');
      }
      return null;
    case 'captured':
      return h('capture', 'Попадание точно на чужую фигуру выбивает её в резерв, и весь её путь обнуляется.');
    default:
      return null;
  }
}
