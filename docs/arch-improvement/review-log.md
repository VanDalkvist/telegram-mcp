# Architecture Improvement Review Log

## Cycle 1 - 2026-05-20 - Folder chat pagination MCP surface

### Context

- Branch: `codex/telegram-mcp-arch-fixes`.
- Source docs: `docs/design.md`, `docs/project-arch-rules.md`, `README.md`.
- Architecture gates: AP-012, AP-020, AP-021, AP-025, AP-026, AP-032, AP-042, AP-043, PAR-001.
- Memory entries used: global Telegram MCP memory for folder tools, `Env (1d)` folder size, ports/adapters, fail-fast validation, and read-only session boundary.
- Baseline checks before fix: `npm test` -> 12 files passed, 69 tests passed; `npm run typecheck` -> exit 0.
- Superpowers plan: `docs/superpowers/plans/2026-05-20-folder-chat-pagination.md`.

### Findings

- [P1] Folder inventory cannot be paged through the MCP surface - fix-now
  - Evidence: `telegram_list_folder_chats` accepted no cursor and existing folder expansion truncated results through bounded `limit`.
  - Impact: downstream event/inbox extraction could miss chats in large folders such as `Env (1d)` with 131 peers.
  - Rule: AP-026, AP-043, PAR-001.
- [P2] Folder inventory pagination was absent from docs - fix-now
  - Evidence: `docs/design.md` only documented bounded folder-scoped message fanout.
  - Impact: downstream users could keep using bounded search when they need full folder inventory.
  - Rule: AP-026.
- [P3] Existing `telegram_list_folder_chats` bounded behavior should remain for compatibility - log-only
  - Evidence: existing tests cover explicit/rule-based folder expansion and small-folder behavior.
  - Impact: replacing it would add compatibility risk.
  - Rule: AP-020, AP-026.

### Fixes Applied

- Added `telegram_list_folder_chats_page` with explicit Zod schema and MCP registration.
  - Changed: `src/interface/tool-schemas.ts`, `src/interface/mcp-tools.ts`, `src/interface/mcp-server.ts`.
  - Tests: `tests/interface/tool-schemas.test.ts`, `tests/interface/mcp-tools.test.ts`.
  - Architecture check: interface stays parse/delegate/register only; no provider calls in MCP handlers.
- Added a focused GramJS pagination operation.
  - Changed: `src/infra/telegram-queries/list-folder-chats-page.ts`, `src/infra/telegram-client-adapter.ts`, `src/infra/telegram-client-types.ts`, `src/infra/telegram-queries/folder-peer-entities.ts`.
  - Tests: `tests/adapter/telegram-client-adapter.test.ts`.
  - Architecture check: new provider behavior lives in a business-named module; adapter remains a thin delegator.
- Added explicit DTO/application contract.
  - Changed: `src/domain/types.ts`, `src/application/telegram-queries.ts`.
  - Tests: `npm run typecheck`.
  - Architecture check: DTO shape is explicit: `{ chats, page: { order: "recent_first", next_cursor? } }`.
- Updated docs.
  - Changed: `README.md`, `docs/design.md`.
  - Validation: inspection plus final build/typecheck.

### Logged Only

- Full folder-scoped message search pagination remains bounded best-effort. The new inventory page gives downstream code a deterministic way to enumerate chats first, then call chat-scoped message APIs.
- `type` filtering is applied after each Telegram dialog page. For full coverage, callers should use `type: "any"` until `next_cursor` is absent.

### Security Scan

- Tool: Codex Security scan, diff-scoped to the current working-tree patch.
- Report: `/tmp/codex-security-scans/telegram-mcp/80f6d5c_20260520T120141Z/report.md`.
- Result: no reportable findings.
- Dependency check: `npm audit --omit=dev --audit-level=moderate --json` -> zero vulnerabilities.
- Fixes after scan: none required.

### Verification

- RED evidence: targeted tests failed on missing schema/handler/adapter method before implementation.
- Edge-case RED evidence: malformed embedded `offset_peer` cursor failed as `CHAT_NOT_FOUND` before parser repair; now covered as `CONFIG_INVALID`.
- Final commands/checks: see final assistant response for fresh verification after the last repo change.

### Residual Risk

- Live Telegram pagination was not executed in this cycle; deterministic adapter tests cover the GramJS parameter contract with mocks.
- If the product later needs folder-scoped message search pagination, implement it as a separate contract over per-chat inventory traversal rather than expanding this folder inventory tool.

### Lessons For Memory

- No new project-local memory entry. The useful durable behavior is already encoded in tests: cursor parsing errors should map to cursor-level `CONFIG_INVALID`, and provider details should stay inside focused query modules.
