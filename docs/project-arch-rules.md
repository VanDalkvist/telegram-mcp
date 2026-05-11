# Telegram MCP Project Architecture Rules

This document is the repo-owned architecture policy for Telegram MCP. It was derived from the upstream AP baseline used during project review, but the rules below are the source of truth for this repository.

## Stage

Current stage: `mvp`.

The project is local-first, but it reads real user Telegram data, so privacy and auth-boundary rules are treated as release-blocking.

## Applicable Critical Rules

- AP-011: keep modules cohesive.
- PAR-1 / PAR-001: each Telegram MCP tool/query scenario must have one primary module named after the business operation. Do not group new tool scenarios into broad `*-queries`, `helpers`, `utils`, `common`, or `misc` files.
- AP-012: fail fast on invalid inputs, invalid Telegram responses, config, auth and access failures.
- AP-013: do not substitute corrupted user data with silent fallbacks.
- AP-016: make trusted security boundaries explicit; the local Telegram session is the boundary for this MVP.
- AP-020: keep use-case orchestration out of transport and provider details.
- AP-021: keep CLI/MCP entry points thin.
- AP-022: map errors through typed application errors.
- AP-023: await async work; long-running best-effort work needs diagnostics.
- AP-025: imports must preserve direction; CLI/interface depend inward, provider adapters do not leak outward.
- AP-026: keep MCP DTOs explicit and stable.
- AP-027: validate required config and Telegram session readiness before exposing tools.
- AP-032: all MCP tools are query/read paths unless a future spec explicitly adds commands.
- AP-039/AP-040: the local Telegram session is the trusted auth boundary for this MVP.
- AP-042: secrets and sessions never enter git, logs, DTOs or debug dumps.
- AP-043: validate every external MCP/tool input before calling Telegram.

## Project Rules

### PAR-1 / PAR-001: One Telegram Tool Scenario Per Business Module

Every Telegram MCP tool/query scenario must have one primary module named after the business operation it implements.

Do:

- add or reuse a focused module such as `list-folders`, `resolve-chat`, `search-messages`, or `get-message-context`;
- name shared modules after a domain operation or contract, for example `folder-peer-entities` or `search-global-messages`;
- keep `telegram-client-adapter` as a thin delegator over these operation modules.

Do not:

- grow a broad adapter with many unrelated Telegram operations;
- create generic `helpers`, `utils`, `common`, or `misc` files;
- add broad buckets like `telegram-message-queries` or `telegram-chat-queries` when the file becomes a dumping ground for multiple tool scenarios.

`PAR-1` is the short project-rule name. `PAR-001` is the stable zero-padded id used in plans, review logs, and grep-friendly references.

## Project Deviations

- No hosted multi-user authorization in MVP. This is a product non-goal from `docs/design.md`, not a relaxation of local session validation.
- No database rules apply until a server-side persistence layer is introduced.
- No frontend rules apply while the project remains CLI/MCP-only.

## Local Review Checklist

- `npm test`
- `npm run typecheck`
- `npm run build`
- Every new Telegram MCP tool/query must add or reuse a business-named module under `src/infra/telegram-queries/`.
- Shared code is allowed only when the module name states a domain operation or contract, for example `folder-peer-entities.ts` or `search-global-messages.ts`. Generic `helpers`, `utils`, `common`, and `misc` modules are forbidden.
- Review `src/infra/telegram-client-adapter.ts` before adding new tools. It should stay a thin delegator, not a place for provider logic.
