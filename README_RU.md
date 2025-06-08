# Mattermost CaseOneBot

CaseOneBot — многофункциональный бот для Mattermost. Сначала он служил простым планировщиком напоминаний, но теперь умеет вести дежурства, приглашать в каналы, работать с Яндекс Календарем и Jira и использовать функции ChatGPT. Бот помогает автоматизировать рутину и улучшить совместную работу.

## Основные команды

### Напоминания
- `!reminder; [cron-расписание]; [сообщение]` — установить напоминание.
- `!reminder-remove; [id]` — удалить напоминание по ID.
- `!reminder-list` — список установленных напоминаний.
- `!reminder-help` — помощь по командам напоминаний.

### Дежурства
- `!duty; [cron-расписание]; [список пользователей]` — установить расписание дежурств (пользователи через запятую).
- `!duty-remove` — удалить расписание дежурств.
- `!duty-current` — показать текущего дежурного.
- `!duty-next` — переключить на следующего дежурного.
- `!duty-help` — помощь по дежурствам.
- `!stat` — статистика сообщений в текущем канале.

### Приглашение в канал
- `!invite; [ссылка-на-канал/название-канала]` — пригласить пользователя в указанный канал. Пример: `!invite; general` или `!invite; https://your-mattermost-server.com/teamname/channels/general`.

### Интеграция с Яндекс Календарем
- `!calendar` — начать процесс интеграции календаря.
- `!calendar-settings` — то же, что и `!calendar`.
- `!calendar-remove` — отключить интеграцию календаря.
- `!meet` — создание встречи в Яндекс Телемосте. Возможные варианты:
  - `!meet` — быстрая встреча по умолчанию.
  - `!meet; [список пользователей]` — встреча с указанными пользователями.
  - `!meet; [список пользователей]; [тема]` — встреча с темой и участниками.
  - `!meet; [список пользователей]; [тема]; [60m|1h]` — дополнительно указать длительность в минутах или часах.
  - Альтернативный синтаксис также поддерживается, см. английскую версию.

### Логирование времени в Jira
- `!jira` — получить ссылку для логирования времени по событиям календаря.

### Пересылка сообщений
- `!forward; [id исходного канала]; [id целевого канала]; [сообщение]; [сообщение-тред]` — настроить пересылку сообщений.
- `!forward-list` — список пересылок.
- `!forward-remove; [id]` — удалить пересылку по ID.
- `!forward-help` — помощь по пересылке.

### Функции ChatGPT
Бот умеет выполнять функции с помощью ChatGPT. Подробнее — в [wiki](https://github.com/deimosowen/Mattermost_CaseOneBot/wiki/Functions).

### Прочее
- `!ping` — проверить работу бота.
- `!sendAs; [id канала/сообщения]; [текст]` — отправить сообщение от имени администратора (только для админа).

### Помощники Jira
- `!review; [ключ задачи]; [ссылка]; [ревьювер]` — перевести задачу в статус Review и отправить уведомление в канал ревью.
- `!reop; [комментарий]` — вернуть задачу из Review в To Do c комментарием.

## Установка
1. Клонируйте репозиторий:
   `git clone https://github.com/deimosowen/Mattermost_CaseOneBot.git`
2. Установите зависимости:
   `npm install`
3. Создайте файл `.env` в корне проекта и заполните переменные окружения:
```
API_BASE_URL=your_mattermost_url
BOT_TOKEN=your_bot_token
TEAM_CHANNEL_ID=your_team_channel_id
TEAM_CHANNEL_PREFIX=your_team_channel_prefix
INREVIEW_CHANNEL_IDS=channel_id_1,channel_id_2
ADMIN_ID=your_admin_id
TZ=your_time_zone
OPENAI_BASE_URL=your_openai_base_url
OPENAI_API_KEY=your_openai_api_key
OPENAI_API_MODEL=your_openai_api_model
OPENAI_API_TEMPERATURE=your_openai_api_temperature
OPENAI_API_TOP_P=your_openai_api_top_p
OPENAI_SESSION_TOKEN=your_openai_session_token
OPENAI_DALLE_API_KEY=your_dalle_api_key
HOST=your_host
PORT=your_port
JIRA_API_URL=your_jira_api_url
JIRA_HOST=your_jira_host
JIRA_ROOT_TASK_ID=your_jira_root_task_id
JIRA_BOT_USERNAME=your_jira_bot_username
JIRA_BOT_PASSWORD=your_jira_bot_password
INVITE_DAYS_THRESHOLD=30
ABSENCE_BASE_URL=your_absence_api_url
ABSENCE_API_TOKEN=your_absence_api_token
YANDEX_CLIENT_ID=your_yandex_client_id
YANDEX_CLIENT_SECRET=your_yandex_client_secret
YANDEX_REDIRECT_URI=your_yandex_redirect_uri
REDIS_HOST=your_redis_host
REDIS_PORT=your_redis_port
REDIS_PASSWORD=your_redis_password
```

- `API_BASE_URL`: URL вашего сервера Mattermost.
- `BOT_TOKEN`: токен бота в Mattermost.
- `TEAM_CHANNEL_ID`: ID командного канала для приглашений.
- `TEAM_CHANNEL_PREFIX`: префикс командных каналов.
- `INREVIEW_CHANNEL_IDS`: ID каналов ревью через запятую.
- `ADMIN_ID`: ID администратора бота.
- `TZ`: используемый часовой пояс.
- `OPENAI_BASE_URL`: базовый URL API OpenAI.
- `OPENAI_API_KEY`: ключ API OpenAI.
- `OPENAI_API_MODEL`: модель OpenAI.
- `OPENAI_API_TEMPERATURE`: параметр temperature.
- `OPENAI_API_TOP_P`: параметр top_p.
- `OPENAI_SESSION_TOKEN`: токен сессии ChatGPT.
- `OPENAI_DALLE_API_KEY`: ключ DALL-E.
- `HOST`: хост сервера бота.
- `PORT`: порт сервера бота.
- `JIRA_API_URL`: URL прокси для Jira.
- `JIRA_HOST`: адрес вашей Jira.
- `JIRA_ROOT_TASK_ID`: ID корневой задачи Jira.
- `JIRA_BOT_USERNAME`: имя пользователя Jira для бота.
- `JIRA_BOT_PASSWORD`: пароль пользователя Jira.
- `INVITE_DAYS_THRESHOLD`: через сколько дней считать канал неактивным.
- `ABSENCE_BASE_URL`: URL сервиса отсутствий.
- `ABSENCE_API_TOKEN`: токен сервиса отсутствий.
- `YANDEX_CLIENT_ID`: client ID для Яндекс.
- `YANDEX_CLIENT_SECRET`: client secret для Яндекс.
- `YANDEX_REDIRECT_URI`: redirect URI для Яндекс.
- `REDIS_HOST`: хост Redis.
- `REDIS_PORT`: порт Redis.
- `REDIS_PASSWORD`: пароль Redis.
4. Запустите бота командой `node index.js`.

## Содействие
Предложения и pull request приветствуются!

## Лицензия
Проект распространяется по лицензии MIT. Подробнее см. в файле `LICENSE`.

