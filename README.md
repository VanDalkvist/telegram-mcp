# Telegram MCP

Read-only MCP-сервер, который даёт агенту поиск и чтение Telegram через ваш собственный MTProto user session.

Telegram часто хранит контекст, который нужен агенту: каналы, группы, сохранённые заметки, треды событий, рабочие чаты и старые решения. `telegram-mcp` превращает этот контекст в локальный Model Context Protocol server, но не даёт агенту прав на запись в Telegram.

## Зачем это нужно

Этот репозиторий закрывает такую пользовательскую работу:

> Я хочу, чтобы агент мог находить и читать нужный контекст в моём Telegram, но не мог ничего отправить, удалить, переслать или случайно изменить.

Практический эффект:

- агент видит Telegram folders и chats, доступные вашему аккаунту;
- чаты и папки превращаются в стабильные refs, которые можно передавать между tools;
- поиск работает глобально, внутри чата или внутри Telegram folder;
- найденное сообщение можно расширить контекстом вокруг него, тредом или обсуждением;
- Telegram credentials и session остаются на вашей машине.

## Граница безопасности

Проект намеренно local-first и read-only.

Сервер работает через MCP `stdio`, читает конфигурацию из локального окружения, хранит Telegram session локально и предоставляет только query tools.

Он не умеет:

- отправлять, пересылать, редактировать, удалять, закреплять сообщения или помечать их прочитанными;
- вступать в чаты или выходить из них;
- работать через Bot API tokens;
- запускать watchers, webhooks, realtime subscriptions или фоновые daemons;
- делать общий media export; локальный export ограничен текущими profile photos через явный file path;
- делать hosted multi-user auth.

Если сервер не может загрузить config или авторизованную Telegram session, он падает до того, как MCP tools станут доступны.

## Security audit

Security policy: [SECURITY.md](SECURITY.md).

Codex Security audit от 2026-05-11 пройден с исправлениями.

Audit tool: [Codex Security by OpenAI](https://openai.com/index/codex-security-now-in-research-preview/).

Audit report: [docs/security/codex-security-audit-2026-05-11.md](docs/security/codex-security-audit-2026-05-11.md).

Исходный Codex Security scan bundle был локальным артефактом Codex run. Репозиторная ссылка выше является durable summary: там зафиксированы scope, findings, fixes и verification.

Audit не является гарантией отсутствия уязвимостей. Он фиксирует один проверенный срез репозитория и набор regression tests на найденные проблемы.

## Warranty and liability

Проект распространяется по [MIT License](LICENSE). Это значит, что software предоставляется as is, без гарантий любого рода; авторы и copyright holders не несут ответственности за claims, damages или other liability, возникающие из использования software.

Используйте `telegram-mcp` на свой риск. Особенно внимательно относитесь к Telegram session, `.env`, логам и доступу агента к приватным чатам.

## Tools

| Область | Tools |
| --- | --- |
| Folders | `telegram_list_folders`, `telegram_resolve_folder`, `telegram_list_folder_chats`, `telegram_list_folder_chats_page` |
| Chats | `telegram_list_chats`, `telegram_search_chats`, `telegram_resolve_chat`, `telegram_get_chat`, `telegram_get_chat_participants` |
| Messages | `telegram_search_messages`, `telegram_get_recent_messages`, `telegram_search_messages_page`, `telegram_search_messages_batch`, `telegram_get_messages`, `telegram_get_message`, `telegram_get_message_context` |
| Threads and discussions | `telegram_get_thread`, `telegram_get_discussion` |
| Media and counters | `telegram_search_media`, `telegram_get_search_counters` |
| Profile photos | `telegram_get_profile_photo_info`, `telegram_download_profile_photo` |

Все Telegram operations read-only. Export tools пишут только в явно переданный локальный file path и не меняют состояние Telegram. Inputs валидируются до вызова Telegram.

## Operator scripts

MCP tool surface остаётся read-only. Для разовых локальных операций с явным side effect в репозитории есть отдельные operator scripts, которые запускаются вручную и используют ту же локальную MTProto user session.

Добавить локальные WebP/PNG в owned regular sticker set:

```sh
npm run stickers:add -- \
  --manifest /absolute/path/to/manifest.json \
  --base-dir /absolute/path/to/sticker/project
```

По умолчанию команда делает dry-run: проверяет авторизацию, ownership sticker set, текущий count, capacity и state. Реальная загрузка требует флаг `--apply`.

Manifest ожидает `sticker_set_short_name` и массив `stickers` с `path`, `emoji`, `slug`, `text`, `sha256`. State пишется рядом с manifest или в путь из `--state`, чтобы повторный запуск пропускал уже загруженные файлы.

Создать новый regular sticker set из локального manifest:

```sh
npm run stickers:create -- \
  --manifest /absolute/path/to/manifest.json \
  --base-dir /absolute/path/to/sticker/project \
  --title "Pack title"
```

Эта команда тоже делает dry-run по умолчанию: проверяет авторизацию, доступность `sticker_set_short_name` и локальные файлы. Реальное создание требует `--apply`. После успешного создания state пишется рядом с manifest или в путь из `--state`.

## Требования

- Node.js 22 или новее.
- Telegram API application из [my.telegram.org](https://my.telegram.org).
- Telegram user account. Bot tokens не поддерживаются, потому что сервер использует MTProto user session.

## Быстрый старт

Установите зависимости:

```sh
npm install
```

Создайте локальную конфигурацию:

```sh
cp .env.example .env
```

Укажите Telegram API credentials:

```sh
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your-api-hash
```

Опциональные пути:

```sh
TELEGRAM_SESSION_PATH=~/.config/telegram-mcp/session
TELEGRAM_LOG_PATH=~/.local/state/telegram-mcp/server.jsonl
```

Один раз пройдите авторизацию:

```sh
npm run auth
```

Команда auth спросит phone number, Telegram login code и 2FA password, если он включён. После этого она сохранит локальную GramJS session string в `TELEGRAM_SESSION_PATH`.

Соберите и запустите MCP server:

```sh
npm run build
node dist/cli/index.js
```

Для локальной разработки можно запускать:

```sh
npm start
```

## Подключение к Codex

Codex читает MCP servers из `~/.codex/config.toml`.

Если `.env` лежит в клоне репозитория, задайте `cwd` на этот репозиторий, чтобы сервер мог загрузить конфигурацию:

```toml
[mcp_servers.telegram-mcp]
command = "node"
args = ["dist/cli/index.js"]
cwd = "/absolute/path/to/telegram-mcp"
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 60
```

После этого перезапустите Codex или перезагрузите MCP servers и проверьте:

```sh
codex mcp list
codex mcp get telegram-mcp
```

Если не хотите, чтобы сервер читал `.env`, передайте config напрямую:

```toml
[mcp_servers.telegram-mcp]
command = "node"
args = ["/absolute/path/to/telegram-mcp/dist/cli/index.js"]
enabled = true

[mcp_servers.telegram-mcp.env]
TELEGRAM_API_ID = "123456"
TELEGRAM_API_HASH = "your-api-hash"
TELEGRAM_SESSION_PATH = "/absolute/path/to/private/session"
TELEGRAM_LOG_PATH = "/absolute/path/to/private/server.jsonl"
```

## Подключение к Claude Code

Для приватной локальной настройки добавьте сервер через `claude mcp add`. Options должны идти до имени сервера:

```sh
claude mcp add --transport stdio \
  --scope local \
  --env TELEGRAM_API_ID=123456 \
  --env TELEGRAM_API_HASH=your-api-hash \
  --env TELEGRAM_SESSION_PATH=/absolute/path/to/private/session \
  telegram-mcp -- node /absolute/path/to/telegram-mcp/dist/cli/index.js
```

Проверьте подключение:

```sh
claude mcp list
claude mcp get telegram-mcp
```

Внутри Claude Code можно использовать `/mcp`, чтобы посмотреть статус соединения.

Для team/project setup Claude Code может читать project `.mcp.json`. Коммитить можно только template с environment variable expansion, без реальных secrets:

```json
{
  "mcpServers": {
    "telegram-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["${TELEGRAM_MCP_ROOT}/dist/cli/index.js"],
      "env": {
        "TELEGRAM_API_ID": "${TELEGRAM_API_ID}",
        "TELEGRAM_API_HASH": "${TELEGRAM_API_HASH}",
        "TELEGRAM_SESSION_PATH": "${TELEGRAM_SESSION_PATH}",
        "TELEGRAM_LOG_PATH": "${TELEGRAM_LOG_PATH:-~/.local/state/telegram-mcp/server.jsonl}"
      }
    }
  }
}
```

Каждый пользователь должен локально задать эти environment variables перед запуском Claude Code.

## Проверка

После подключения через Codex или Claude Code попросите агента вызвать:

1. `telegram_list_chats`
2. `telegram_search_chats`
3. `telegram_search_messages`
4. `telegram_get_message_context`

Эти calls проверяют базовый retrieval flow и не меняют состояние Telegram.

Для полной live smoke-проверки на настроенном Telegram account:

```sh
npm run smoke:live
```

Live smoke runner пытается пройти каждый MCP tool handler и печатает только redacted metrics: scenario names, success flags, counts, booleans, page order, profile-photo status и error codes. Он не печатает chat titles, usernames, `chat_ref`, local output paths, message ids, message text, session strings, phone numbers или API credentials.

Account-dependent сценарии вроде threads, discussions и participants могут падать, если Telegram не поддерживает выбранный объект. Runner сообщает об этом как об optional failure и не превращает приватные Telegram data в fixtures.

## Разработка

```sh
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

GitHub Actions запускает deterministic CI checks на push и pull request: install, typecheck, tests, build и package dry run. Live Telegram smoke намеренно остаётся local-only, потому что требует приватную Telegram session.

## Архитектура

Приложение собрано вокруг одного потока: агент вызывает MCP tool, сервер валидирует вход, выполняет read-only запрос к Telegram через авторизованную локальную сессию и возвращает нормализованный ответ со стабильными refs.

Основные части:

- CLI запускает MCP-сервер поверх `stdio` и отвечает только за вход в процесс.
- `Composition root` загружает `.env`, открывает хранилище сессии, создаёт GramJS client и проверяет авторизацию в Telegram до публикации tools.
- `Interface layer` регистрирует MCP tools, валидирует входные данные и превращает ошибки в публичный MCP-ответ.
- `Application layer` задаёт контракт Telegram queries: какие read-only операции существуют и какие DTO они возвращают.
- `Infrastructure layer` работает с файловой сессией, логами, GramJS client и конкретными запросами к Telegram.
- `Domain layer` хранит типы, refs, правила для окон дат и typed errors.

Путь запроса выглядит так:

```text
Agent
  -> MCP tool
  -> input schema
  -> Telegram query contract
  -> модуль конкретной операции
  -> GramJS / Telegram
  -> normalized DTO
  -> MCP response
```

Архитектурные правила проекта фиксируют границы этой схемы: локальная сессия Telegram — это `trusted boundary`; tools остаются `read-only`; `config`, `auth` и `session readiness` проходят fail-fast проверку до старта; внешние `inputs` валидируются до Telegram; ошибки мапятся в `typed errors` и не прячутся за пустыми результатами; новые Telegram tool/query-сценарии добавляются отдельными модулями по смыслу операции.

Основные проектные документы:

- [docs/design.md](docs/design.md)
- [docs/project-arch-rules.md](docs/project-arch-rules.md)
