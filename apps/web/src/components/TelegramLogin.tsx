import { useEffect, useRef } from 'react';

/** Кнопка входа Telegram Login Widget (на сайте). Внутри Telegram Mini App не нужна. */
export function TelegramLogin({ bot, onAuth }: { bot: string; onAuth: (user: Record<string, unknown>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const w = window as unknown as { onTelegramAuth?: (u: Record<string, unknown>) => void };
    w.onTelegramAuth = onAuth;
    const el = ref.current;
    if (!el) return;
    el.innerHTML = '';
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.setAttribute('data-telegram-login', bot);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-radius', '12');
    s.setAttribute('data-onauth', 'onTelegramAuth(user)');
    s.setAttribute('data-request-access', 'write');
    el.appendChild(s);
    return () => {
      delete w.onTelegramAuth;
    };
  }, [bot, onAuth]);
  return <div ref={ref} className="min-h-[44px]" data-testid="tg-login" />;
}
