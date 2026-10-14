import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyWebAppInitData } from '../src/accounts';
import { createBlokhaServer, type BlokhaServer } from '../src/server';
import { PRODUCTS, type TgUpdate } from '../src/telegram';

describe('вход из Mini App', () => {
  it('проверяет initData', () => {
    const token = '123:ABC';
    const user = JSON.stringify({ id: 7, first_name: 'Дима', username: 'dz' });
    const auth_date = Math.floor(Date.now() / 1000);
    const pairs = { auth_date: String(auth_date), query_id: 'q1', user };
    const check = Object.keys(pairs).sort().map((k) => `${k}=${(pairs as Record<string, string>)[k]}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    const hash = createHmac('sha256', secret).update(check).digest('hex');
    const initData = new URLSearchParams({ ...pairs, hash }).toString();
    expect(verifyWebAppInitData(initData, token).id).toBe(7);
    expect(() => verifyWebAppInitData(initData.replace(hash, 'ff'), token)).toThrow(/Подпись/);
  });
});

describe('платежи Telegram Stars (мок Bot API)', () => {
  let server: BlokhaServer;
  let url: string;
  const calls: { method: string; body: any }[] = [];
  let tg: ReturnType<typeof createServer>;
  let tgUrl = '';
  beforeAll(async () => {
    tg = createServer((req, res) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => {
        const method = req.url!.split('/').pop()!;
        const body = data ? JSON.parse(data) : {};
        calls.push({ method, body });
        res.setHeader('content-type', 'application/json');
        if (method === 'createInvoiceLink') res.end(JSON.stringify({ ok: true, result: `https://t.me/$pay_${body.payload}` }));
        else if (method === 'getUpdates') res.end(JSON.stringify({ ok: true, result: [] }));
        else res.end(JSON.stringify({ ok: true, result: true }));
      });
    });
    await new Promise<void>((r) => tg.listen(0, r));
    tgUrl = `http://127.0.0.1:${(tg.address() as { port: number }).port}`;
    server = await createBlokhaServer({ staticDir: null, botDelayMs: 5, devLogin: true, telegramBotToken: '123:ABC', telegramApiBase: tgUrl, telegramPolling: false, webAppUrl: 'https://game.example' });
    await new Promise<void>((r) => server.http.listen(0, r));
    const addr = server.http.address();
    url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  });
  afterAll(async () => {
    await server.close();
    tg.close();
  });
  const api = async (path: string, body?: unknown, token?: string) => {
    const r = await fetch(url + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return (await r.json()) as { ok: boolean; data?: any; error?: { code: string; message: string } };
  };

  it('счёт создаётся в XTR, pre_checkout подтверждается, successful_payment зачисляет премиум один раз', async () => {
    const a = (await api('/api/auth/dev', { name: 'Аня' })).data;
    expect((await api('/api/shop/products')).data.map((p: any) => p.id)).toContain('premium');
    expect((await api('/api/me', undefined, a.token)).data.premium).toBe(false);
    const inv = await api('/api/shop/invoice', { productId: 'premium' }, a.token);
    expect(inv.ok).toBe(true);
    const call = calls.find((c) => c.method === 'createInvoiceLink')!;
    expect(call.body.currency).toBe('XTR');
    expect(call.body.prices[0].amount).toBe(PRODUCTS[0]!.stars);
    const payload: string = call.body.payload;
    expect(payload.startsWith(`${a.account.id}:premium:`)).toBe(true);

    const bot = server.bot!;
    await bot.handle({ update_id: 1, pre_checkout_query: { id: 'pcq1', invoice_payload: payload, total_amount: 150 } } as TgUpdate);
    expect(calls.find((c) => c.method === 'answerPreCheckoutQuery')!.body.ok).toBe(true);
    await bot.handle({ update_id: 2, pre_checkout_query: { id: 'pcq2', invoice_payload: '999:nope:x', total_amount: 1 } } as TgUpdate);
    expect(calls.filter((c) => c.method === 'answerPreCheckoutQuery')[1]!.body.ok).toBe(false);

    const paid: TgUpdate = { update_id: 3, message: { chat: { id: 1 }, successful_payment: { currency: 'XTR', total_amount: 150, invoice_payload: payload, telegram_payment_charge_id: 'ch_1' } } };
    await bot.handle(paid);
    await bot.handle(paid); // повтор того же платежа не дублируется
    expect((await api('/api/me', undefined, a.token)).data.premium).toBe(true);
    const purchases = (await api('/api/shop/purchases', undefined, a.token)).data;
    expect(purchases.purchases).toHaveLength(1);
    expect(calls.filter((c) => c.method === 'sendMessage')).toHaveLength(1);
    // премиум второй раз не продаём
    expect((await api('/api/shop/invoice', { productId: 'premium' }, a.token)).error?.message).toMatch(/уже/);
    // /start даёт кнопку «Играть»
    await bot.handle({ update_id: 4, message: { chat: { id: 5 }, text: '/start' } });
    const start = calls.filter((c) => c.method === 'sendMessage').at(-1)!;
    expect(start.body.reply_markup.inline_keyboard[0][0].web_app.url).toBe('https://game.example');
  });
});
