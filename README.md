# Telegram MCP

Read-only MCP-сервер, который даёт агенту поиск и чтение Telegram через ваш собственный MTProto user session.

Telegram часто хранит контекст, который нужен агенту: каналы, группы, сохранённые заметки, треды событий, рабочие чаты и старые решения. `telegram-mcp` превращает этот контекст в локальный Model Context Protocol server, но не даёт агенту прав на запись в Telegram.

## Зачем Это Нужно

Этот репозиторий закрывает такую пользовательскую работу:

> Я хочу, чтобы агент мог находить и читать нужный контекст в моём Telegram, но не мог ничего отправить, удалить, переслать или случайно изменить.

Практический эффект:

- агент видит Telegram folders и chats, доступные вашему аккаунту;
- чаты и папки превращаются в стабильные refs, которые можно передавать между tools;
- поиск работает глобально, внутри чата или внутри Telegram folder;
- найденное сообщение можно расширить контекстом вокруг него, тредом или обсуждением;
- Telegram credentials и session остаются на вашей машине.

## Граница Безопасности

Проект намеренно local-first и read-only.

Сервер работает через MCP `stdio`, читает конфигурацию из локального окружения, хранит Telegram session локально и предоставляет только query tools.

Он не умеет:

- отправлять, пересылать, редактировать, удалять, закреплять сообщения или помечать их прочитанными;
- вступать в чаты или выходить из них;
- работать через Bot API tokens;
- запускать watchers, webhooks, realtime subscriptions или фоновые daemons;
- скачивать media files;
- делать hosted multi-user auth.

Если сервер не может загрузить config или авторизованную Telegram session, он падает до того, как MCP tools станут доступны.

## Tools

| Область | Tools |
| --- | --- |
| Folders | `telegram_list_folders`, `telegram_resolve_folder`, `telegram_list_folder_chats` |
| Chats | `telegram_list_chats`, `telegram_search_chats`, `telegram_resolve_chat`, `telegram_get_chat`, `telegram_get_chat_participants` |
| Messages | `telegram_search_messages`, `telegram_get_recent_messages`, `telegram_search_messages_page`, `telegram_search_messages_batch`, `telegram_get_messages`, `telegram_get_message`, `telegram_get_message_context` |
| Threads and discussions | `telegram_get_thread`, `telegram_get_discussion` |
| Media and counters | `telegram_search_media`, `telegram_get_search_counters` |

Все tools read-only. Inputs валидируются до вызова Telegram.

## Требования

- Node.js 22 или новее.
- Telegram API application из [my.telegram.org](https://my.telegram.org).
- Telegram user account. Bot tokens не поддерживаются, потому что сервер использует MTProto user session.

## Быстрый Старт

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

## Подключение К Codex

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

## Подключение К Claude Code

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

Live smoke runner пытается пройти каждый MCP tool handler и печатает только redacted metrics: scenario names, success flags, counts, booleans, page order и error codes. Он не печатает chat titles, usernames, `chat_ref`, message ids, message text, session strings, phone numbers или API credentials.

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

Проект использует небольшой ports-and-adapters shape:

- MCP tools валидируют inputs и возвращают стабильные DTO.
- Telegram adapter modules владеют GramJS calls и нормализацией Telegram responses.
- Config и session loading fail-fast выполняются до публикации tools.
- Query modules разделены по business operation. Generic `helpers`, `utils`, `common` и `misc` dumping grounds запрещены.

Основные проектные документы:

- [docs/design.md](docs/design.md)
- [docs/project-arch-rules.md](docs/project-arch-rules.md)
