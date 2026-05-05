# Telegram MCP Design

## Goal

Build a local-first, read-only MCP server that lets an agent search and read Telegram chats, groups, channels, and messages from a user account.

The first version optimizes for a fast local development loop and a narrow safety boundary. It must still leave a clean path to a future server deployment with proper user authorization and encrypted session storage.

## Non-Goals

- No Telegram Bot API or grammY in the first version.
- No message sending, forwarding, deleting, joining, leaving, pinning, or marking as read.
- No realtime updates, watchers, webhooks, or daemon subscriptions.
- No media download in the first version.
- No multi-user server authorization in the first version.

## Product Shape

The MCP server is a read-only personal Telegram access layer for agents. The useful workflow is:

1. Discover available chats.
2. Search or resolve a specific chat.
3. Inspect chat metadata.
4. Search messages globally or within the chat.
5. Read message history.
6. Expand context around a found message.

This is intentionally broader than a thin message-search wrapper. Agents need stable chat references and surrounding context to produce reliable answers.

## Technology Choices

- Runtime: Node.js.
- Language: TypeScript.
- Telegram client: GramJS, npm package `telegram`.
- MCP transport: stdio for the first version.
- Configuration: `.env`.
- Session format: GramJS `StringSession`.
- Session storage: local file store in the first version.

GramJS is the right first adapter because it supports MTProto user sessions in Node.js without pulling in TDLib native runtime complexity. TDLib remains a future adapter option if GramJS becomes a reliability or production constraint.

## Architecture

The codebase should keep MCP, Telegram, configuration, and session concerns separate.

### Components

`McpServer`

Registers MCP tools, validates inputs, maps tool calls to domain operations, and returns normalized outputs. It must not call GramJS directly.

`TelegramClientAdapter`

Owns read-only Telegram operations over GramJS. It hides GramJS request shapes, entity handling, pagination details, and Telegram errors from MCP tool handlers.

`SessionStore`

Loads and saves Telegram session strings. The first implementation is `FileSessionStore`; a future server version can replace it with encrypted database storage without changing tool handlers.

`AuthFlow`

Performs interactive local login. The first implementation is CLI-only and used by `telegram-mcp auth`.

`Config`

Reads `.env`, validates required values, expands filesystem paths, and fails fast on invalid configuration.

`PeerRef`

A stable serialized chat reference passed between tools. It should be explicit enough to avoid title-only matching once a chat has been resolved.

## Configuration

Required `.env` values:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Optional `.env` values:

- `TELEGRAM_SESSION_PATH`, defaulting to `~/.config/telegram-mcp/session`

The server should fail at startup if required config is missing or malformed. It should not start in a degraded state.

## Authorization And Session Flow

`telegram-mcp auth`:

1. Loads `.env`.
2. Prompts for phone number.
3. Prompts for Telegram login code.
4. Prompts for 2FA password if Telegram requires it.
5. Saves the resulting GramJS `StringSession` via `SessionStore`.
6. Verifies the saved session by reconnecting or fetching the current user.

`telegram-mcp` MCP server:

1. Loads `.env`.
2. Loads session via `SessionStore`.
3. Fails with `AUTH_REQUIRED` if the session file is missing or invalid.
4. Connects GramJS client non-interactively.
5. Registers read-only tools over stdio.

The MCP server must never prompt for credentials during stdio operation.

## Fail-Fast Development Rule

The first version should fail loudly on missing config, missing session, invalid peer references, unsupported Telegram peer types, and unexpected Telegram responses.

Do not silently return empty arrays for conditions that are probably configuration, authorization, parsing, or access errors. Empty arrays are valid only for successful Telegram calls with no matching results.

## Tool Surface

All tools are read-only.

### `telegram_list_chats`

Lists recent dialogs visible to the authenticated user.

Inputs:

- `limit`: number, default 50, max 100.
- `type`: optional enum `any`, `channel`, `group`, `user`.

Output:

- `chats`: array of chat summaries.
- Each summary includes `chat_ref`, `title`, `username`, `type`, and best-effort metadata available from the dialog.

### `telegram_search_chats`

Searches chats, groups, channels, and users by query.

Inputs:

- `query`: string.
- `type`: optional enum `any`, `channel`, `group`, `user`.
- `limit`: number, default 20, max 50.

Output:

- `chats`: array of chat summaries with `chat_ref`.

### `telegram_resolve_chat`

Resolves a user-supplied chat reference into a stable `chat_ref`.

Inputs:

- `ref`: string. May be a public username, Telegram link, serialized `chat_ref`, numeric id, or exact title candidate.

Output:

- `chat`: single chat summary with stable `chat_ref`.

Ambiguous title matches must fail with a typed ambiguity error instead of guessing.

### `telegram_get_chat`

Returns metadata for a resolved chat.

Inputs:

- `chat_ref`: string.

Output:

- `chat`: metadata including `chat_ref`, `title`, `username`, `type`, description when available, and best-effort counts when available.

### `telegram_search_messages`

Searches messages globally or within one chat.

Inputs:

- `query`: string.
- `chat_ref`: optional string.
- `limit`: number, default 20, max 50.
- `from_date`: optional ISO date string.
- `to_date`: optional ISO date string.

Output:

- `messages`: array of message summaries.
- Each result includes `chat_ref`, `message_id`, `date`, `sender` when available, `text`, and a stable message link when Telegram exposes enough data.

### `telegram_get_messages`

Reads message history for a chat.

Inputs:

- `chat_ref`: string.
- `limit`: number, default 50, max 100.
- `before_message_id`: optional number.
- `after_message_id`: optional number.

Output:

- `messages`: array sorted from older to newer unless Telegram constraints force another order, in which case the output must state the order.
- `page`: pagination hints for the next request.

### `telegram_get_message`

Fetches one message by chat and message id.

Inputs:

- `chat_ref`: string.
- `message_id`: number.

Output:

- `message`: full normalized message.

### `telegram_get_message_context`

Fetches a target message plus nearby messages in the same chat.

Inputs:

- `chat_ref`: string.
- `message_id`: number.
- `before`: number, default 10, max 50.
- `after`: number, default 10, max 50.

Output:

- `target`: normalized target message.
- `before`: array of preceding messages.
- `after`: array of following messages.

This tool exists because search hits without surrounding context are usually not enough for an agent to answer accurately.

## Normalized Data Shapes

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

Errors should be normalized before returning through MCP:

- `AUTH_REQUIRED`: no session, invalid session, expired session, or Telegram demands re-auth.
- `CONFIG_INVALID`: missing or invalid `.env` values.
- `CHAT_NOT_FOUND`: peer resolution failed.
- `CHAT_AMBIGUOUS`: title search found multiple candidates.
- `MESSAGE_NOT_FOUND`: requested message id does not exist or is inaccessible.
- `ACCESS_DENIED`: private channel, group, or user unavailable to the current account.
- `RATE_LIMITED`: Telegram flood wait or rate limit, with retry hint if available.
- `TELEGRAM_ERROR`: known Telegram error not covered above.
- `INTERNAL_ERROR`: unexpected local bug.

## Future Server Path

The first version should avoid server implementation, but preserve these extension points:

- Replace `FileSessionStore` with `EncryptedDbSessionStore`.
- Replace `CliAuthFlow` with a web-based login flow.
- Add HTTP transport separately from stdio.
- Add per-user authorization around tool calls.
- Add audit logging for read operations.

The future server path must not require changing the public tool contracts.

## Testing Strategy

Unit tests:

- Config validation fails fast on missing and malformed `.env`.
- `FileSessionStore` loads, saves, and rejects empty sessions.
- `PeerRef` serialization/deserialization is stable.
- Tool schemas reject invalid input.
- Error normalization maps GramJS/Telegram errors to typed errors.

Adapter tests:

- Use a mocked GramJS client.
- Verify each adapter method calls the expected Telegram operation.
- Verify pagination and date filters are translated consistently.
- Verify ambiguous chat resolution fails instead of guessing.

Manual smoke tests:

1. Run `telegram-mcp auth`.
2. Start MCP server over stdio.
3. Call `telegram_list_chats`.
4. Call `telegram_search_chats`.
5. Call `telegram_search_messages`.
6. Call `telegram_get_message_context` on one search result.

No test should require sending, forwarding, joining, or modifying Telegram state.

## Open Decisions For Implementation Plan

- Exact MCP SDK package and version.
- Exact CLI package layout.
- Exact `chat_ref` serialization format.
- Whether to use Vitest or Node's built-in test runner.

These are implementation choices and should be settled in the implementation plan, not by changing the product design.
