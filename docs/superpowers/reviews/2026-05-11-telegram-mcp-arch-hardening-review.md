# Telegram MCP Architecture Hardening Review Log

## Slice 1: Server Readiness Is Honest

- Verification: `npm test -- tests/unit/server.test.ts tests/unit/create-app.test.ts tests/adapter/telegram-client-adapter.test.ts && npm run typecheck` -> pass; 29 targeted tests passed and TypeScript typecheck exited 0.
- AP review: AP-027/AP-039 pass because `runServer` now builds Telegram queries, which loads the session and checks authorization, before MCP stdio is connected. AP-020/AP-021 pass with a caveat: `runServerWithDeps` is an explicit test seam in the CLI boundary, not business logic in the entry point. AP-023 pass after follow-up fix: initialized Telegram queries are disposed if MCP transport connection fails. AP-032 pass; the slice adds no Telegram write operation.
- Business path review: pass. `connect MCP -> first tool call` no longer hides invalid Telegram readiness until the agent is already mid-task.
- Residual risks: startup now connects to Telegram before exposing tools, so a slow Telegram connection delays MCP startup. This is correct for the current fail-fast product contract. `createLazyTelegramQueries` was removed so tests no longer bless the old readiness model.
- Decision: proceed.

## Slice 2: Stable Chat Ref For Global Search Results

- Verification: `npm test -- tests/unit/server.test.ts tests/unit/create-app.test.ts tests/adapter/telegram-client-adapter.test.ts && npm run typecheck` -> pass; 30 targeted tests passed and TypeScript typecheck exited 0.
- AP review: AP-026 pass because global search results now use Telegram response `chats/users` entities to build follow-up-safe `chat_ref` values with access hashes when available. AP-013/AP-012 pass after follow-up fix: if Telegram omits the entity needed for a follow-up-safe global search ref, the normalizer throws a typed `TELEGRAM_ERROR` instead of returning a syntactically valid but fragile id-only ref. AP-020/AP-018 acceptable for this slice: `telegram-normalizers.ts` gained a focused response-to-DTO helper, but the file remains a known larger module to split in a separate adapter/normalizer decomposition follow-up.
- Business path review: pass. The core path `search -> use returned chat_ref for get context/thread/message` is stronger for private channel hits.
- Residual risks: `normalizeMessagesFromResponse` still falls back to caller-provided chat ref for thread/discussion-style responses. That is acceptable because those calls are already scoped by input `chat_ref`; global search no longer uses that fallback.
- Decision: proceed.

## Slice 3: Date Window And Telegram Data Integrity

- Verification: `npm test -- tests/unit/server.test.ts tests/unit/create-app.test.ts tests/adapter/telegram-client-adapter.test.ts tests/interface/tool-schemas.test.ts` -> pass; 41 targeted tests passed. `npm run typecheck` -> pass. `git diff --check` -> pass. External review also ran full `npm test`, `npm run typecheck`, and `npm run build` -> pass.
- AP review: AP-012/AP-013 pass after follow-up fixes. Tool schemas now accept only date-only `YYYY-MM-DD` inputs, reject malformed calendar dates and timestamp strings, and reject reversed windows. Provider missing/invalid dates now become typed `TELEGRAM_ERROR` instead of epoch fallback or raw `RangeError`. AP-026 pass because date-window semantics are centralized in `src/domain/date-window.ts`: `from_date` maps to UTC start-of-day and `to_date` maps to UTC end-of-day. AP-028/AP-056 pass because tests cover schema validation, chat-scoped filtering, global filtering, final-day inclusion, and invalid provider data. AP-032 pass; no Telegram write operations were added.
- Business path review: pass. Date-window searches now mean what a user expects: searching through `2026-05-15` includes messages later that day, while empty results no longer hide invalid input or out-of-window provider leakage.
- Residual risks: date semantics are explicitly UTC. That is acceptable for this local MCP slice, but a future UX layer may need user-timezone date windows if users expect Moscow/local calendar days.
- Decision: proceed.

## Slice 4: Safe Diagnostic Error Details

- Verification: `npm test -- tests/unit/create-app.test.ts tests/unit/server.test.ts tests/interface/tool-schemas.test.ts tests/adapter/telegram-client-adapter.test.ts` -> pass; 43 targeted tests passed. `npm run typecheck` -> pass. `git diff --check` -> pass. External review also ran `npm test -- tests/unit/create-app.test.ts tests/unit/server.test.ts tests/interface/mcp-tools.test.ts`, `npm run typecheck`, and `git diff --check` -> pass.
- AP review: AP-017/AP-024 pass because `tool_call_failed` now logs sanitized public error details, converting arrays like ambiguity candidates to aggregate counts and dropping string/object payloads that can contain `chat_ref`, titles or usernames. AP-026 pass because MCP error responses still return the original `publicError`, so the caller keeps actionable ambiguity candidates. AP-032 pass; no Telegram write operation was added.
- Business path review: pass. The agent can still recover from ambiguity using returned candidates, while durable diagnostic logs avoid storing private Telegram identifiers and labels.
- Residual risks: sanitizer intentionally keeps only numeric/boolean scalar detail fields plus array counts. If future errors need safe string diagnostics, they should add explicit allowlisted fields instead of bypassing this helper.
- Decision: proceed.

## Slice 5: Telegram Client Adapter Decomposition

- Verification: `npm test -- tests/adapter/telegram-client-adapter.test.ts tests/unit/create-app.test.ts tests/interface/mcp-tools.test.ts` -> pass; 39 targeted tests passed. `npm run typecheck` -> pass. External review also ran full `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check` -> pass.
- AP review: AP-011/AP-019 pass after follow-up fixes. `src/infra/telegram-client-adapter.ts` is now a thin `TelegramQueries` delegator, and each Telegram tool/query scenario has a business-named primary module under `src/infra/telegram-queries/`. PAR-001 pass after replacing the generic `context.ts` with `telegram-query-context.ts` and removing broad `telegram-*-queries.ts` and `*-helpers.ts` files. AP-020/AP-025 pass because provider-specific GramJS imports remain in infra and do not leak into application/interface layers. AP-032 pass; the split added no Telegram write operation.
- Business path review: pass. The runtime behavior is preserved by adapter/tool tests, while future tool growth now has a clear file ownership rule instead of growing a single adapter or generic helpers file.
- Residual risks: `telegram-normalizers.ts` remains a broad normalization module. It is outside this slice's query-method decomposition and should be split only with focused normalizer tests.
- Decision: proceed.

## Slice 6: Project-Owned Architecture Policy

- Verification: `git status --short docs/project-arch-rules.md` -> tracked as a new doc in the worktree. External review checked `docs/project-arch-rules.md` against `docs/design.md` -> proceed.
- AP review: AP-016/AP-025/AP-043 are now explicit in the repo policy. PAR-001 is a mandatory project rule: every Telegram MCP tool/query scenario gets one business-named module, and `helpers`, `utils`, `common`, `misc`, or broad query buckets are forbidden. AP-042/AP-032 remain explicit for secrets/session/logs and read-only tools.
- Business path review: pass. The project now has repo-owned guardrails for local-first, read-only Telegram access and for preventing future tool additions from recreating a giant adapter.
- Residual risks: none for this docs slice.
- Decision: proceed.

## Slice 7: Redacted Live Smoke

- Verification: `npm test` -> pass; 12 test files and 68 tests passed. `npm run typecheck` -> pass. `npm run smoke:live` -> pass against the configured local Telegram account. `npm pack --dry-run` -> pass and includes only package files plus `tools/live-smoke.mjs`.
- AP review: AP-017/AP-024/AP-042 pass because the live smoke runner prints only scenario names, success flags, counts, booleans, page order, and public error codes; it does not print chat titles, usernames, `chat_ref` values, folder refs, message ids, message text, sessions, phone numbers, or API credentials. AP-032 pass because every scenario calls existing read-only query tools. PAR-001 pass because this slice does not add Telegram query implementation modules or generic `helpers`/`utils` files; the new script is a single tooling module with the business purpose of redacted live smoke verification.
- Business path review: pass. The live examples cover `connect -> list folders/chats -> get chat -> recent messages -> context -> search messages/media`, which is the core agent retrieval path, without turning private Telegram content into fixtures or committed test data.
- Residual risks: live smoke depends on the local Telegram account state and `.env`, so it is intentionally an operator smoke test rather than a deterministic CI test.
- Decision: proceed.
