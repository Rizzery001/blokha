import { createBlokhaServer } from './server';

const port = Number(process.env.PORT ?? 3001);
const botDelayMs = Number(process.env.BOT_DELAY_MS ?? 1100);
const server = createBlokhaServer({ botDelayMs });
server.http.listen(port, () => {
  console.log(`BLOKHA server listening on :${port} (комнаты хранятся в памяти; перезапуск удалит партии)`);
});
