# Telegram MCP

Read-only MCP server that lets an agent search and read Telegram through your own MTProto user session.

Telegram is often where the useful context lives: channels, groups, saved notes, event threads, private work chats, and old decisions. `telegram-mcp` turns that context into a local Model Context Protocol server without giving the agent any Telegram write capability.

## What This Gives An Agent

- List Telegram folders and chats visible to your account.
- Resolve folders and chats into stable references.
- Search messages globally, inside a chat, or inside a Telegram folder.
- Read recent messages, single messages, surrounding context, threads, discussions, media results, search counters, and participants when Telegram grants access.
- Keep all Telegram credentials and session material on your machine.

## Safety Boundary

This project is intentionally local-first and read-only.

It runs over MCP `stdio`, reads configuration from your local environment, stores the Telegram session locally, and exposes only query tools.

It does not:

- send, forward, edit, delete, pin, or mark messages as read;
- join or leave chats;
- use Bot API tokens;
- run watchers, webhooks, realtime subscriptions, or background daemons;
- download media files;
- provide hosted multi-user auth.

If the server cannot load config or an authorized Telegram session, it fails before exposing MCP tools.

## Tool Surface

| Area | Tools |
| --- | --- |
| Folders | `telegram_list_folders`, `telegram_resolve_folder`, `telegram_list_folder_chats` |
| Chats | `telegram_list_chats`, `telegram_search_chats`, `telegram_resolve_chat`, `telegram_get_chat`, `telegram_get_chat_participants` |
| Messages | `telegram_search_messages`, `telegram_get_recent_messages`, `telegram_search_messages_page`, `telegram_search_messages_batch`, `telegram_get_messages`, `telegram_get_message`, `telegram_get_message_context` |
| Threads and discussions | `telegram_get_thread`, `telegram_get_discussion` |
| Media and counters | `telegram_search_media`, `telegram_get_search_counters` |

All tools are read-only. Tool inputs are validated before Telegram is called.

## Requirements

- Node.js 22 or newer.
- A Telegram API application from [my.telegram.org](https://my.telegram.org).
- A Telegram user account. Bot tokens are not supported because this server uses MTProto user sessions.

## Quick Start

Install dependencies:

```sh
npm install
```

Create local configuration:

```sh
cp .env.example .env
```

Set your Telegram API credentials:

```sh
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your-api-hash
```

Optional paths:

```sh
TELEGRAM_SESSION_PATH=~/.config/telegram-mcp/session
TELEGRAM_LOG_PATH=~/.local/state/telegram-mcp/server.jsonl
```

Authenticate once:

```sh
npm run auth
```

The auth command asks for your phone number, Telegram login code, and 2FA password if your account requires one. It stores a local GramJS session string at `TELEGRAM_SESSION_PATH`.

Build and run the MCP server:

```sh
npm run build
node dist/cli/index.js
```

For local development you can also run:

```sh
npm start
```

## Use With Codex

Codex reads MCP servers from `~/.codex/config.toml`.

If you keep `.env` in the cloned repository, set `cwd` to the repository so the server can load it:

```toml
[mcp_servers.telegram-mcp]
command = "node"
args = ["dist/cli/index.js"]
cwd = "/absolute/path/to/telegram-mcp"
enabled = true
startup_timeout_sec = 30
tool_timeout_sec = 60
```

Then restart Codex or reload MCP servers and verify:

```sh
codex mcp list
codex mcp get telegram-mcp
```

If you prefer not to load `.env`, pass config directly:

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

## Use With Claude Code

For a private local setup, add the server with `claude mcp add`. Options must come before the server name:

```sh
claude mcp add --transport stdio \
  --scope local \
  --env TELEGRAM_API_ID=123456 \
  --env TELEGRAM_API_HASH=your-api-hash \
  --env TELEGRAM_SESSION_PATH=/absolute/path/to/private/session \
  telegram-mcp -- node /absolute/path/to/telegram-mcp/dist/cli/index.js
```

Verify it:

```sh
claude mcp list
claude mcp get telegram-mcp
```

Inside Claude Code, use `/mcp` to inspect connection status.

For a team/project setup, Claude Code can read a project `.mcp.json`. Commit only a template that uses environment variable expansion, not real secrets:

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

Each user must set those environment variables locally before starting Claude Code.

## Verify It Works

After connecting through Codex or Claude Code, ask the agent to call:

1. `telegram_list_chats`
2. `telegram_search_chats`
3. `telegram_search_messages`
4. `telegram_get_message_context`

These calls cover the basic retrieval flow without modifying Telegram state.

For a full local live smoke test against your configured Telegram account:

```sh
npm run smoke:live
```

The live smoke runner attempts every MCP tool handler and prints only redacted metrics: scenario names, success flags, counts, booleans, page order, and error codes. It does not print chat titles, usernames, `chat_ref` values, message ids, message text, session strings, phone numbers, or API credentials.

Account-dependent scenarios such as threads, discussions, and participants may fail when Telegram does not support the sampled object. The runner reports those as optional failures instead of turning private Telegram data into fixtures.

## Development

```sh
npm test
npm run typecheck
npm run build
npm pack --dry-run
```

GitHub Actions runs deterministic CI checks on push and pull request: install, typecheck, tests, build, and package dry run. Live Telegram smoke is intentionally local-only because it needs a private Telegram session.

## Architecture Notes

The project follows a small ports-and-adapters shape:

- MCP tools validate inputs and expose stable DTOs.
- Telegram adapter modules own GramJS calls and normalize Telegram responses.
- Config and session loading fail fast before tools are exposed.
- Query modules are split by business operation. Generic `helpers`, `utils`, `common`, and `misc` dumping grounds are forbidden.

Project design and architecture rules live in:

- [docs/design.md](docs/design.md)
- [docs/project-arch-rules.md](docs/project-arch-rules.md)
