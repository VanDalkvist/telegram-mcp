# Дизайн Telegram MCP

## Цель

Собрать local-first read-only MCP-сервер, который дает агенту доступ к поиску и чтению Telegram-чатов, групп, каналов и сообщений от имени пользовательского аккаунта.

Первая версия оптимизируется под быстрый локальный цикл разработки и узкую safety boundary. При этом архитектура должна оставлять чистый путь к будущему серверному деплою с нормальной пользовательской авторизацией и зашифрованным хранением сессий.

## Язык спецификаций

Спецификации проекта пишутся на русском. Имена tool-ов, переменных окружения, кодовых сущностей и публичные API-контракты остаются на английском.

## Не-цели

- Не используем Telegram Bot API или grammY в первой версии.
- Не отправляем, не пересылаем, не удаляем сообщения, не вступаем в чаты, не выходим из чатов, не закрепляем сообщения и не помечаем сообщения прочитанными.
- Не делаем realtime updates, watchers, webhooks или daemon subscriptions.
- Не скачиваем медиа в первой версии.
- Не делаем мультипользовательскую серверную авторизацию в первой версии.

## Продуктовая форма

MCP-сервер — это read-only personal Telegram access layer для агентов. Полезный сценарий:

1. Посмотреть доступные чаты.
2. Найти или разрешить конкретный чат.
3. Посмотреть метаданные чата.
4. Найти сообщения глобально или внутри чата.
5. Прочитать историю сообщений.
6. Расширить контекст вокруг найденного сообщения.

Это намеренно шире, чем тонкая обертка над поиском сообщений. Агенту нужны стабильные ссылки на чаты и контекст вокруг найденных сообщений, иначе ответы будут хрупкими.

## Технологические решения

- Runtime: Node.js.
- Язык: TypeScript.
- Telegram client: GramJS, npm package `telegram`.
- MCP transport: `stdio` для первой версии.
- Конфигурация: `.env`.
- Формат сессии: GramJS `StringSession`.
- Хранение сессии: локальный file store в первой версии.

GramJS — правильный первый adapter, потому что он поддерживает MTProto user sessions в Node.js без сложности native runtime TDLib. TDLib остается возможным будущим adapter-ом, если GramJS упрется в надежность или production constraints.

## Архитектура

Кодовая база должна разделять MCP, Telegram, конфигурацию и сессии.

### Компоненты

`McpServer`

Регистрирует MCP tools, валидирует input, мапит tool calls на доменные операции и возвращает нормализованные outputs. Не должен напрямую вызывать GramJS.

`TelegramClientAdapter`

Владеет read-only Telegram-операциями поверх GramJS. Прячет от MCP tool handlers формы GramJS-запросов, entity handling, pagination details и Telegram errors.

`SessionStore`

Загружает и сохраняет Telegram session strings. Первая реализация — `FileSessionStore`; будущая серверная версия сможет заменить ее на encrypted database storage без изменений в tool handlers.

`AuthFlow`

Выполняет интерактивный локальный login. Первая реализация — CLI-only и используется командой `telegram-mcp auth`.

`Config`

Читает `.env`, валидирует обязательные значения, раскрывает filesystem paths и fail-fast падает на невалидной конфигурации.

`PeerRef`

Стабильная сериализованная ссылка на чат, которую tools передают друг другу. Она должна быть достаточно явной, чтобы после resolve не полагаться на title-only matching.

## Конфигурация

Обязательные `.env` значения:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Опциональные `.env` значения:

- `TELEGRAM_SESSION_PATH`, default: `~/.config/telegram-mcp/session`

Сервер должен падать при старте, если обязательный config отсутствует или невалиден. Он не должен запускаться в degraded state.

## Авторизация и сессия

`telegram-mcp auth`:

1. Загружает `.env`.
2. Спрашивает phone number.
3. Спрашивает Telegram login code.
4. Спрашивает 2FA password, если Telegram его требует.
5. Сохраняет полученный GramJS `StringSession` через `SessionStore`.
6. Проверяет сохраненную сессию через reconnect или получение текущего пользователя.

`telegram-mcp` MCP server:

1. Загружает `.env`.
2. Загружает session через `SessionStore`.
3. Падает с `AUTH_REQUIRED`, если session file отсутствует или невалиден.
4. Подключает GramJS client non-interactively.
5. Регистрирует read-only tools поверх `stdio`.

MCP server никогда не должен спрашивать credentials во время `stdio` operation.

## Fail-Fast правило разработки

Первая версия должна громко падать на missing config, missing session, invalid peer references, unsupported Telegram peer types и неожиданных Telegram responses.

Нельзя молча возвращать пустые массивы для ситуаций, которые вероятно являются configuration, authorization, parsing или access errors. Пустой массив валиден только для успешного Telegram call без результатов.

## Tool surface

Все tools read-only.

### `telegram_list_chats`

Список последних dialogs, видимых авторизованному пользователю.

Inputs:

- `limit`: number, default 50, max 100.
- `type`: optional enum `any`, `channel`, `group`, `user`.

Output:

- `chats`: array of chat summaries.
- Каждый summary содержит `chat_ref`, `title`, `username`, `type` и best-effort metadata из dialog.

### `telegram_search_chats`

Ищет чаты, группы, каналы и пользователей по query.

Inputs:

- `query`: string.
- `type`: optional enum `any`, `channel`, `group`, `user`.
- `limit`: number, default 20, max 50.

Output:

- `chats`: array of chat summaries with `chat_ref`.

### `telegram_resolve_chat`

Превращает пользовательскую ссылку на чат в стабильный `chat_ref`.

Inputs:

- `ref`: string. Может быть public username, Telegram link, serialized `chat_ref`, numeric id или exact title candidate.

Output:

- `chat`: single chat summary with stable `chat_ref`.

Ambiguous title matches должны падать typed ambiguity error, а не выбирать первый результат.

### `telegram_get_chat`

Возвращает metadata для resolved chat.

Inputs:

- `chat_ref`: string.

Output:

- `chat`: metadata including `chat_ref`, `title`, `username`, `type`, description when available, and best-effort counts when available.

### `telegram_search_messages`

Ищет сообщения глобально или внутри одного чата.

Inputs:

- `query`: string.
- `chat_ref`: optional string.
- `limit`: number, default 20, max 50.
- `from_date`: optional ISO date string.
- `to_date`: optional ISO date string.

Output:

- `messages`: array of message summaries.
- Каждый result содержит `chat_ref`, `message_id`, `date`, `sender` when available, `text` и stable message link, если Telegram exposes enough data.

### `telegram_get_messages`

Читает message history для чата.

Inputs:

- `chat_ref`: string.
- `limit`: number, default 50, max 100.
- `before_message_id`: optional number.
- `after_message_id`: optional number.

Output:

- `messages`: array sorted from older to newer unless Telegram constraints force another order; if so, output must state the order.
- `page`: pagination hints for the next request.

### `telegram_get_message`

Получает одно сообщение по chat и message id.

Inputs:

- `chat_ref`: string.
- `message_id`: number.

Output:

- `message`: full normalized message.

### `telegram_get_message_context`

Получает target message и соседние сообщения в том же чате.

Inputs:

- `chat_ref`: string.
- `message_id`: number.
- `before`: number, default 10, max 50.
- `after`: number, default 10, max 50.

Output:

- `target`: normalized target message.
- `before`: array of preceding messages.
- `after`: array of following messages.

Этот tool нужен, потому что search hits без surrounding context обычно недостаточны для точного ответа агента.

## Нормализованные data shapes

### Chat Summary

- `chat_ref`: string.
- `id`: string.
- `access_hash`: optional string.
- `title`: string.
- `username`: optional string.
- `type`: enum `channel`, `group`, `user`.
- `is_public`: boolean.

### Message Summary

- `chat_ref`: string.
- `message_id`: number.
- `date`: ISO string.
- `sender`: optional sender summary.
- `text`: string.
- `reply_to_message_id`: optional number.
- `views`: optional number.
- `forwards`: optional number.

### Error

Errors должны нормализоваться перед возвратом через MCP:

- `AUTH_REQUIRED`: no session, invalid session, expired session или Telegram требует re-auth.
- `CONFIG_INVALID`: missing or invalid `.env` values.
- `CHAT_NOT_FOUND`: peer resolution failed.
- `CHAT_AMBIGUOUS`: title search found multiple candidates.
- `MESSAGE_NOT_FOUND`: requested message id does not exist or is inaccessible.
- `ACCESS_DENIED`: private channel, group или user unavailable to the current account.
- `RATE_LIMITED`: Telegram flood wait или rate limit, с retry hint если доступен.
- `TELEGRAM_ERROR`: known Telegram error not covered above.
- `INTERNAL_ERROR`: unexpected local bug.

## Будущий server path

Первая версия не должна реализовывать server mode, но должна сохранить extension points:

- Заменить `FileSessionStore` на `EncryptedDbSessionStore`.
- Заменить `CliAuthFlow` на web-based login flow.
- Добавить HTTP transport отдельно от `stdio`.
- Добавить per-user authorization вокруг tool calls.
- Добавить audit logging для read operations.

Будущий server path не должен требовать изменения публичных tool contracts.

## Стратегия тестирования

Unit tests:

- Config validation fail-fast падает на missing и malformed `.env`.
- `FileSessionStore` загружает, сохраняет и отвергает empty sessions.
- `PeerRef` serialization/deserialization stable.
- Tool schemas reject invalid input.
- Error normalization maps GramJS/Telegram errors to typed errors.

Adapter tests:

- Используют mocked GramJS client.
- Проверяют, что каждый adapter method вызывает ожидаемую Telegram operation.
- Проверяют, что pagination и date filters translated consistently.
- Проверяют, что ambiguous chat resolution fails instead of guessing.

Manual smoke tests:

1. Run `telegram-mcp auth`.
2. Start MCP server over `stdio`.
3. Call `telegram_list_chats`.
4. Call `telegram_search_chats`.
5. Call `telegram_search_messages`.
6. Call `telegram_get_message_context` on one search result.

Ни один test не должен требовать sending, forwarding, joining или modifying Telegram state.

## Открытые решения для implementation plan

- Exact MCP SDK package and version.
- Exact CLI package layout.
- Exact `chat_ref` serialization format.
- Vitest или Node's built-in test runner.

Это implementation choices. Их нужно решить в implementation plan, а не через изменение product design.
