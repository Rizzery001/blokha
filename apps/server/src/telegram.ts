/**
 * Бот Telegram для платежей Stars и кнопки «Играть»: long polling getUpdates внутри сервера игры.
 * Деньги идут на баланс Stars бота; вывод — через @BotFather / Fragment по правилам Telegram.
 */
import { randomBytes } from 'node:crypto';
import type { AccountService } from './accounts';

export interface Product {
  id: string;
  title: string;
  description: string;
  stars: number;
  kind: 'premium' | 'tip';
}

export const PRODUCTS: Product[] = [
  { id: 'premium', title: 'Блоха Премиум', description: 'Все наборы фигур, аватары и темы открыты навсегда, золотая рамка профиля.', stars: 150, kind: 'premium' },
  { id: 'tip-50', title: 'Спасибо авторам ☕', description: 'Поддержать разработку игры.', stars: 50, kind: 'tip' },
  { id: 'tip-250', title: 'Большое спасибо 🍰', description: 'Поддержать разработку игры.', stars: 250, kind: 'tip' },
];

export interface TelegramBotOptions {
  token: string;
  apiBase?: string | undefined;
  accounts: AccountService;
  /** адрес игры для кнопки в /start */
  webAppUrl?: string | undefined;
  /** вызывается после зачисления покупки */
  onPurchase?: (accountId: number, product: Product) => void;
  log?: (msg: string) => void;
}

export class TelegramBot {
  private offset = 0;
  private running = false;
  private api: string;
  constructor(private opts: TelegramBotOptions) {
    this.api = `${opts.apiBase ?? 'https://api.telegram.org'}/bot${opts.token}`;
  }

  async call<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
    const r = await fetch(`${this.api}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await r.json()) as { ok: boolean; result?: T; description?: string };
    if (!j.ok) throw new Error(`Telegram ${method}: ${j.description ?? r.status}`);
    return j.result as T;
  }

  /** Ссылка на счёт в Stars. payload связывает платёж с аккаунтом и товаром. */
  async createInvoiceLink(accountId: number, product: Product): Promise<string> {
    const payload = `${accountId}:${product.id}:${randomBytes(4).toString('hex')}`;
    return this.call<string>('createInvoiceLink', {
      title: product.title,
      description: product.description,
      payload,
      currency: 'XTR',
      prices: [{ label: product.title, amount: product.stars }],
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }
  stop() {
    this.running = false;
  }

  private async loop() {
    while (this.running) {
      try {
        const updates = await this.call<TgUpdate[]>('getUpdates', { offset: this.offset, timeout: 25, allowed_updates: ['message', 'pre_checkout_query'] });
        for (const u of updates) {
          this.offset = u.update_id + 1;
          await this.handle(u).catch((e) => this.opts.log?.(`update ${u.update_id}: ${String(e)}`));
        }
      } catch (e) {
        this.opts.log?.(`getUpdates: ${String(e)}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  async handle(u: TgUpdate): Promise<void> {
    if (u.pre_checkout_query) {
      const q = u.pre_checkout_query;
      const ok = this.parsePayload(q.invoice_payload) !== null;
      await this.call('answerPreCheckoutQuery', { pre_checkout_query_id: q.id, ok, error_message: ok ? undefined : 'Неизвестный товар' });
      return;
    }
    const m = u.message;
    if (!m) return;
    if (m.successful_payment) {
      const sp = m.successful_payment;
      const parsed = this.parsePayload(sp.invoice_payload);
      if (!parsed) return;
      const fresh = this.opts.accounts.recordPurchase(parsed.accountId, parsed.product.id, sp.total_amount, sp.telegram_payment_charge_id, sp.invoice_payload);
      if (fresh) {
        this.opts.onPurchase?.(parsed.accountId, parsed.product);
        await this.call('sendMessage', { chat_id: m.chat.id, text: `Спасибо! «${parsed.product.title}» активировано. Откройте игру — всё уже доступно.` });
      }
      return;
    }
    if (m.text && /^\/start/.test(m.text)) {
      const url = this.opts.webAppUrl;
      await this.call('sendMessage', {
        chat_id: m.chat.id,
        text: 'Блоха — семейная настольная игра: кубик, четыре фигуры, круг по доске и своя финишная диагональ. Играйте с друзьями онлайн или против роботов.',
        reply_markup: url ? { inline_keyboard: [[{ text: '🎲 Играть', web_app: { url } }]] } : undefined,
      });
    }
  }

  parsePayload(payload: string): { accountId: number; product: Product } | null {
    const [acc, prod] = payload.split(':');
    const accountId = Number(acc);
    const product = PRODUCTS.find((p) => p.id === prod);
    if (!accountId || !product) return null;
    return { accountId, product };
  }
}

export interface TgUpdate {
  update_id: number;
  message?: { chat: { id: number }; text?: string; successful_payment?: { currency: string; total_amount: number; invoice_payload: string; telegram_payment_charge_id: string } };
  pre_checkout_query?: { id: string; invoice_payload: string; total_amount: number };
}
