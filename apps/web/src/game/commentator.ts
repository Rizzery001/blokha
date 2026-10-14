import type { GameEvent, GameState } from '@blokha/game-engine';

/** Комментатор: короткие реплики в важных моментах. Возвращает null, если момент обычный. */
export function commentate(prev: GameState | null, next: GameState, e: GameEvent, random: () => number = Math.random): string | null {
  const name = (id: string) => next.players.find((p) => p.id === id)?.nickname ?? id;
  const pick = (arr: string[]) => arr[Math.floor(random() * arr.length)]!;
  const lap = next.config.perimeter.length;
  switch (e.type) {
    case 'rolled': {
      const st = next.stats?.[e.playerId];
      if (e.value === 6 && st && st.sixStreak >= 3) return pick([`${name(e.playerId)} — третья шестёрка подряд! Кубик заряжен?`, `Да это уже неприлично: ${name(e.playerId)} снова шесть!`]);
      if (e.value === 6 && st && st.sixStreak === 2) return pick([`Две шестёрки подряд у ${name(e.playerId)}!`, `${name(e.playerId)} поймал волну: 6 и ещё 6.`]);
      return null;
    }
    case 'captured': {
      const victim = prev?.players.find((p) => p.id === e.victimPlayerId);
      const vp = victim?.pieces.find((p) => p.id === e.victimPieceId);
      if (vp && vp.progress !== null && vp.progress >= lap) return pick([`Ох! ${name(e.byPlayerId)} выбил фигуру ${name(e.victimPlayerId)} прямо с угла после целого круга!`, `Жестоко: полный круг ${name(e.victimPlayerId)} сгорел на пороге дома.`]);
      if (vp && vp.progress !== null && vp.progress >= lap - 5) return pick([`${name(e.victimPlayerId)} не дошёл до дома всего ничего…`, `${name(e.byPlayerId)} подловил у самого финиша!`]);
      const st = next.stats?.[e.byPlayerId];
      if (st && st.captures >= 3 && st.captures % 3 === 0) return `${name(e.byPlayerId)} сегодня в ударе: уже ${st.captures} выбитых.`;
      return null;
    }
    case 'moved':
      if (e.kind === 'autoBackward') return pick([`${name(e.playerId)} угодил на «5 назад». Бывает.`, `Назад, назад! ${name(e.playerId)} откатился на D8.`]);
      if (e.kind === 'autoForward') return pick([`Трамплин! ${name(e.playerId)} пролетел вперёд.`, `${name(e.playerId)} поймал попутный ветер.`]);
      return null;
    case 'autoMoveCancelled':
      return e.steps < 0 ? `${name(e.playerId)} спасён от «5 назад»: путь занят!` : null;
    case 'turnBalance':
      if (e.rolls === -3) return pick([`Три пропуска для ${name(e.playerId)}. Чайку?`, `${name(e.playerId)} на C8. Это надолго.`]);
      if (e.rolls === 3) return `${name(e.playerId)} на F1: три броска подряд!`;
      return null;
    case 'rollBurned': {
      const st = next.stats?.[e.playerId];
      return st && st.burnedRolls >= 3 && st.burnedRolls % 3 === 0 ? `У ${name(e.playerId)} уже ${st.burnedRolls} сгоревших бросков. Нужна шестёрка!` : null;
    }
    case 'gameFinished':
      return pick([`Партия окончена. ${name(e.winnerId)} — чемпион стола!`, `${name(e.winnerId)} закрыл диагональ. Реванш?`]);
    default:
      return null;
  }
}

let voiceEnabled = false;
export function setVoice(v: boolean) {
  voiceEnabled = v;
  if (!v && typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
export function speak(text: string) {
  if (!voiceEnabled || typeof speechSynthesis === 'undefined') return;
  try {
    const u = new SpeechSynthesisUtterance(text.replace(/[🎲🏆🤖]/g, ''));
    u.lang = 'ru-RU';
    u.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}
