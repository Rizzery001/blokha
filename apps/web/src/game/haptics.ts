/** Вибрация: в Telegram Mini App через HapticFeedback, в браузере через navigator.vibrate (Android). */
import { telegramWebApp } from './account';

export const haptic = {
  light() {
    const wa = telegramWebApp();
    if (wa?.HapticFeedback) wa.HapticFeedback.impactOccurred('light');
    else navigator.vibrate?.(10);
  },
  medium() {
    const wa = telegramWebApp();
    if (wa?.HapticFeedback) wa.HapticFeedback.impactOccurred('medium');
    else navigator.vibrate?.(25);
  },
  heavy() {
    const wa = telegramWebApp();
    if (wa?.HapticFeedback) wa.HapticFeedback.impactOccurred('heavy');
    else navigator.vibrate?.([40, 30, 60]);
  },
  success() {
    const wa = telegramWebApp();
    if (wa?.HapticFeedback) wa.HapticFeedback.notificationOccurred('success');
    else navigator.vibrate?.([20, 40, 20, 40, 60]);
  },
  error() {
    const wa = telegramWebApp();
    if (wa?.HapticFeedback) wa.HapticFeedback.notificationOccurred('error');
    else navigator.vibrate?.([60, 40, 60]);
  },
};
