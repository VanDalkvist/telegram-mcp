# Telegram MCP

Read-only Model Context Protocol server for searching and reading Telegram chats through a user MTProto session.

This project is local-first: it runs over MCP `stdio`, stores the Telegram session on the local machine, and exposes only read operations. It does not send, forward, delete, join, leave, pin, or mark Telegram messages as read.

## Tools

- `telegram_list_folders`
- `telegram_resolve_folder`
- `telegram_list_chats`
- `telegram_list_folder_chats`
- `telegram_search_chats`
- `telegram_resolve_chat`
- `telegram_get_chat`
- `telegram_search_messages`
- `telegram_get_recent_messages`
- `telegram_search_messages_page`
- `telegram_search_messages_batch`
- `telegram_search_media`
- `telegram_get_messages`
- `telegram_get_message`
- `telegram_get_message_context`
- `telegram_get_thread`
- `telegram_get_discussion`
- `telegram_get_search_counters`
- `telegram_get_chat_participants`

## Setup

Requirements:

- Node.js 22 or newer.
- A Telegram API application from <https://my.telegram.org>.
- A Telegram user account. Bot tokens are not supported because this server uses MTProto user sessions.

Create a Telegram API application at `my.telegram.org`, then configure local environment variables:

```sh
cp .env.example .env
```

Set:

```sh
TELEGRAM_API_ID=123456
TELEGRAM_API_HASH=your-api-hash
```

Optional:

```sh
TELEGRAM_SESSION_PATH=~/.config/telegram-mcp/session
TELEGRAM_LOG_PATH=~/.local/state/telegram-mcp/server.jsonl
```

Install dependencies and authenticate:

```sh
npm install
npm run auth
```

`npm run auth` opens an interactive login flow. It asks for your phone number, Telegram login code, and 2FA password if your account requires one. The resulting session is stored locally at `TELEGRAM_SESSION_PATH`.

Run the MCP server:

```sh
npm start
```

For production-style use, build first:

```sh
npm run build
node dist/cli/index.js
```

## Use With Agents

Build the server before wiring it into an agent:

```sh
npm install
npm run build
```

Keep `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, and the session file private. Do not commit `.env`, `.mcp.json` with real secrets, or a Telegram session file.

### Codex

Codex reads MCP servers from `~/.codex/config.toml`. If you keep `.env` in the cloned repository, set `cwd` to that repository so the server can load it:

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

If you do not want the server to read `.env`, pass configuration directly in the Codex config instead:

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

### Claude Code

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

## Smoke Test

After connecting through Codex or Claude Code, ask the agent to call:

1. `telegram_list_chats`
2. `telegram_search_chats`
3. `telegram_search_messages`
4. `telegram_get_message_context`

These calls cover the basic retrieval flow without modifying Telegram state.

For a local live smoke test against your configured Telegram account:

```sh
npm run smoke:live
```

The live smoke runner prints only scenario names, success flags, counts, and error codes. It does not print chat titles, usernames, `chat_ref` values, message ids, or message text. It attempts every MCP tool handler; account-dependent scenarios such as threads, discussions, and participants are reported as optional failures when Telegram does not support that object.

## Development

```sh
npm test
npm run typecheck
npm run build
```

GitHub Actions runs deterministic CI checks on push and pull request: install, typecheck, tests, build, and package dry run. Live Telegram smoke is intentionally local-only because it needs a private Telegram session.

The public architecture notes live in [docs/design.md](docs/design.md).
