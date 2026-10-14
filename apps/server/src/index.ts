import { createBlokhaServer } from './server';

const port = Number(process.env.PORT ?? 3001);
const botDelayMs = Number(process.env.BOT_DELAY_MS ?? 1100);
const server = await createBlokhaServer({
  botDelayMs,
  dataDir: process.env.DATA_DIR ?? './data',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME,
  devLogin: process.env.DEV_LOGIN === '1',
  telegramPolling: process.env.TELEGRAM_POLLING !== '0',
  webAppUrl: process.env.WEB_APP_URL,
});
server.http.listen(port, () => {
  console.log(`BLOKHA server listening on :${port} (комнаты в памяти; аккаунты и друзья в ${process.env.DATA_DIR ?? './data'}/blokha.sqlite)`);
});
