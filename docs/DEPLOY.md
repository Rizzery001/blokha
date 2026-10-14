# Деплой BLOKHA

Игре нужен один процесс Node.js с постоянными WebSocket-соединениями (Socket.IO).
Сервер раздаёт собранный web-клиент и обрабатывает комнаты, поэтому хостинг только
статических сайтов (GitHub Pages, Netlify без функций, Vercel static) не подходит для онлайна.

## Свой сервер DigitalOcean (основной вариант)

Игра живёт на том же дроплете, что Clause и Eleanor, рядом с ними в Docker. Общий `docker-compose.yml`
и `Caddyfile` лежат в репозитории `Rizzery001/clause-bot` (`deploy/`): там сервис `blokha` и сайт
`{$HOST_BLOKHA}`. Адрес: `https://blokha-<ip через дефисы>.sslip.io`, HTTPS выдаёт Caddy.

Выкладка: job `blokha` в `clause-bot/.github/workflows/deploy.yml` берёт `main` этого репозитория,
заливает его по SSH в `/opt/bots/blokha` и пересобирает контейнер. Запускается при каждом пуше в
`clause-bot` и вручную: GitHub → clause-bot → Actions → deploy → Run workflow. Секреты
`DEPLOY_SSH_KEY` и `DEPLOY_HOST` уже есть в clause-bot, в этом репозитории ничего настраивать не нужно.

Вручную на сервере: `ssh root@<ip> /opt/bots/clause/deploy/deploy.sh blokha`, логи `docker logs -f deploy-blokha-1`.

## Telegram: вход, друзья, Mini App и платежи Stars

Нужен бот в Telegram (один раз, 5 минут, всё в приложении Telegram):

1. Откройте [@BotFather](https://t.me/BotFather) → `/newbot` → имя «Блоха», username, например `blokha_game_bot`.
   BotFather пришлёт **токен** вида `123456789:AA...` — это секрет.
2. `/setdomain` → выберите бота → введите `blokha-104-248-243-31.sslip.io` (нужно для кнопки входа на сайте).
3. `/newapp` → выберите бота → название «Блоха», описание, картинка 640×360, URL `https://blokha-104-248-243-31.sslip.io`,
   короткое имя `play`. Получится ссылка Mini App `https://t.me/<username>/play`: внутри Telegram вход автоматический.
4. Платежи Stars включены у любого бота по умолчанию; баланс Stars бота виден в @BotFather → Bot Settings → Payments.

Затем добавьте два секрета в GitHub → clause-bot → Settings → Secrets → Actions:
`BLOKHA_TELEGRAM_BOT_TOKEN` (токен) и `BLOKHA_TELEGRAM_BOT_USERNAME` (username без @).
Следующий деплой запишет их в `/opt/bots/blokha/.env` на сервере, и вход, друзья и магазин заработают.
База аккаунтов лежит в Docker-томе `blokha_data` (файл `/data/blokha.sqlite`), переживает редеплои.

## Любой VPS / Docker

```bash
docker build -t blokha .
docker run -d -p 80:3001 -e PORT=3001 --name blokha blokha
```

Или без Docker (Node ≥ 20, pnpm 10):

```bash
pnpm install --frozen-lockfile
pnpm build
PORT=3001 pnpm start
```

За reverse-proxy (nginx, Caddy) включите проброс WebSocket (`Upgrade`/`Connection` заголовки).

## Проверка после деплоя

- `GET /health` → `{"ok":true,"rooms":N}`.
- Два устройства (или два браузера) входят в одну комнату, видят одинаковые броски.
- Перезагрузка страницы возвращает игрока в партию.

## Ограничения MVP

- **Комнаты хранятся в памяти процесса.** Перезапуск, редеплой или падение сервера удаляет все
  партии; клиенты получают сообщение «Комната недоступна» и возвращаются на главный экран. Для
  сохранности реализуйте `RoomStore` (`apps/server/src/roomStore.ts`) поверх Redis/Postgres
  (на дроплете можно поднять Redis рядом в том же compose).
- Один экземпляр сервера: горизонтальное масштабирование потребует общего хранилища и адаптера Socket.IO.
- Неактивные комнаты удаляются через 6 часов.
- Нет аккаунтов: вход по гостевому нику и токену места, который хранится в браузере игрока.
- Отключившийся игрок не заменяется роботом: партия ждёт его переподключения.
- Мобильные приложения не входят в MVP; клиент адаптивный, работает в мобильном браузере.
