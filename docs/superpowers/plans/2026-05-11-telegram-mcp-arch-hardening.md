# Telegram MCP Architecture Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the highest-value architecture risks found in the Telegram MCP review: honest readiness, stable retrieval contracts, stricter data integrity, safer logs, cohesive Telegram adapter modules, and repo-local architecture policy.

**Architecture:** Keep the product boundary local-first, read-only, user-account MTProto over GramJS. Preserve the existing ports-and-adapters shape, but move critical readiness and data-contract checks closer to the trusted boundaries. Do not add write operations, Bot API, hosted multi-user auth, media download, watchers, or webhooks.

**Tech Stack:** Node.js 22+, TypeScript, Vitest, Zod, GramJS `telegram`, MCP stdio.

---

## Architecture Context

- Stage: `mvp`, with live personal-data risk because the MCP reads a real Telegram account.
- Product source of truth: `docs/design.md`.
- Architecture baseline: this plan was derived from the AP baseline used during review; after Task 6, `docs/project-arch-rules.md` is the repo-owned source of truth.
- Applicable critical AP gates: AP-011, AP-012, AP-013, AP-016, AP-020, AP-021, AP-022, AP-023, AP-025, AP-026, AP-027, AP-032, AP-039, AP-040, AP-042, AP-043.
- Applicable baseline AP gates: AP-010, AP-017, AP-018, AP-019, AP-024, AP-028, AP-029, AP-056.
- Not applicable in this pass: frontend rules, database migration/index rules, hosted multi-tenant production rules.

## File Structure

- Modify `src/cli/server.ts`: start MCP only after Telegram session/auth is checked, and dispose the Telegram runtime if MCP transport startup fails.
- Modify `src/composition/create-app.ts`: expose a lifecycle-owned `buildTelegramRuntime()` instead of a lazy or query-only connected client factory.
- Modify `tests/unit/create-app.test.ts`: remove the product expectation that Telegram connection is lazy and cover startup cleanup on auth failure.
- Create `tests/unit/server.test.ts`: verifies server startup performs readiness before MCP connect and fails before exposing tools on auth errors.
- Modify `src/infra/telegram-normalizers.ts`: build stable `chat_ref` from Telegram response `chats/users`.
- Modify `src/infra/telegram-records.ts`: fail on invalid/missing Telegram message dates with typed errors.
- Modify `tests/adapter/telegram-client-adapter.test.ts`: cover global search returning follow-up-safe refs.
- Modify `tests/unit/errors.test.ts` or create focused tests if needed for public/log-safe details.
- Modify `src/interface/mcp-server.ts`: sanitize error details before diagnostic logging.
- Modify `tests/unit/create-app.test.ts`: cover log redaction of ambiguity details.
- Modify `src/interface/tool-schemas.ts`: add reusable strict ISO date and date range validation.
- Modify `tests/interface/tool-schemas.test.ts`: prove malformed dates and reversed date windows fail.
- Refactor `src/infra/telegram-client-adapter.ts` into focused folder/chat/message/thread query modules.
- Create `docs/project-arch-rules.md`: project-local architecture policy and explicit deviations.
- Create: `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`: running post-slice architecture review log.

## Mandatory Post-Slice Architecture Review Gate

After every implementation slice and before starting the next slice, run an architecture review against both the changed diff and the business user path. This is mandatory even when tests pass.

This gate is not documentation-only. If the review finds an architecture smell, AP violation, or business-path regression, fix it immediately in the same slice before moving on. Then rerun verification and rerun the architecture review. Repeat until the slice review decision is `proceed`.

Use the Superpowers multiagent flow for this gate:

- Implementer: writes the slice with TDD and self-review.
- Spec/AP reviewer: checks the slice against this plan, `docs/design.md`, and applicable AP rules.
- Business-path reviewer: checks whether the agent/user retrieval path improved or regressed.
- Controller: integrates findings, applies or delegates fixes, reruns verification, and only then starts the next slice.

For each slice:

1. Run the slice verification commands listed in that task.
2. Inspect only the current slice diff:

```sh
git diff -- src tests docs package.json
```

3. Check applicable AP gates:

- AP-011/AP-018/AP-019: Did this slice create a larger, less cohesive module or add another unrelated responsibility?
- PAR-001: Does every Telegram tool/query scenario live in a business-named module, with no `helpers`, `utils`, `common`, or `misc` dumping ground?
- AP-012/AP-013/AP-022: Are new invalid states rejected with typed errors instead of silent fallback?
- AP-020/AP-021/AP-025: Did dependencies stay pointed inward, and are entry points still thin?
- AP-026/AP-050: Are DTOs, refs, schemas and enums still explicit contracts?
- AP-027/AP-039/AP-042: Are config/session/auth/secrets validated at the trusted boundary and kept out of output/logs?
- AP-032: Did query tools remain read-only?
- AP-017/AP-024: Did logs and public outputs avoid unnecessary sensitive data?
- AP-023/AP-045: Are async fan-out and expensive provider calls bounded or explicitly deferred as residual risk?
- AP-028/AP-056: Does the test type match the risk, and did the test fail before the fix?

4. Check business-sense gates:

- Does the agent's core path still work: connect MCP -> list/resolve chat or folder -> search -> use returned refs for context?
- Does a failure happen early enough for the agent to recover, rather than after it has built a wrong answer?
- Does an empty result still mean "Telegram returned no results", not "we silently swallowed invalid input/provider data"?
- Does the change reduce future product risk without adding non-goal scope such as Bot API, write tools, hosted auth, watchers, media downloads or webhooks?

5. Append a short entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`:

```md
## Slice N: <name>

- Verification: `<command>` -> pass/fail summary.
- AP review: pass/fail by AP id, with file links for any residual smell.
- Business path review: pass/fail for the user journey.
- Residual risks: none | explicit follow-up.
- Decision: proceed | stop before next slice.
```

If the decision is `stop`, do not continue implementation. Fix the smell immediately when the fix is local to the current slice; update the plan only when the review exposes a wrong or incomplete plan assumption.

## Task 1: Server Readiness Is Honest

**Files:**
- Modify: `src/cli/server.ts`
- Modify: `tests/unit/create-app.test.ts`
- Create: `tests/unit/server.test.ts`

- [ ] **Step 1: Write failing readiness tests**

Add `tests/unit/server.test.ts` with two tests:

```ts
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AppError } from "../../src/domain/errors.js";
import { runServerWithDeps } from "../../src/cli/server.js";
import type { AppConfig } from "../../src/config/config.js";
import type { TelegramQueries } from "../../src/application/telegram-queries.js";

describe("runServerWithDeps", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  test("checks Telegram readiness before connecting MCP stdio", async () => {
    const queries = { listChats: vi.fn() } as unknown as TelegramQueries;
    const runtime = { queries, dispose: vi.fn().mockResolvedValue(undefined) };
    const connect = vi.fn().mockResolvedValue(undefined);
    const buildRuntime = vi.fn().mockResolvedValue(runtime);
    const createServer = vi.fn().mockReturnValue({ connect });

    await runServerWithDeps({
      loadConfig: () => makeConfig(),
      createLogger: () => ({ info: vi.fn().mockResolvedValue(undefined), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
      buildRuntime,
      createServer,
      createTransport: () => ({}) as never
    });

    expect(buildRuntime).toHaveBeenCalledOnce();
    expect(createServer).toHaveBeenCalledWith(queries, expect.any(Object));
    expect(connect).toHaveBeenCalledOnce();
    expect(buildRuntime.mock.invocationCallOrder[0]).toBeLessThan(connect.mock.invocationCallOrder[0]!);
  });

  test("does not expose MCP tools when Telegram auth is invalid", async () => {
    const connect = vi.fn();
    const createServer = vi.fn().mockReturnValue({ connect });
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    await runServerWithDeps({
      loadConfig: () => makeConfig(),
      createLogger: () => ({ info: vi.fn().mockResolvedValue(undefined), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
      buildRuntime: vi.fn().mockRejectedValue(
        new AppError("AUTH_REQUIRED", "Telegram session is not authorized", {
          publicMessage: "Telegram authorization is required"
        })
      ),
      createServer,
      createTransport: () => ({}) as never
    });

    expect(createServer).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(stderrWrite.mock.calls[0]![0]).toContain("AUTH_REQUIRED");
  });
});

function makeConfig(): AppConfig {
  return {
    telegramApiId: 123,
    telegramApiHash: "hash",
    sessionPath: "/tmp/session",
    logPath: "/tmp/telegram-mcp/server.jsonl"
  };
}
```

- [ ] **Step 2: Run red test**

Run: `npm test -- tests/unit/server.test.ts`

Expected before implementation: first test fails because `runServer` calls `createLazyTelegramQueries` and never builds a ready Telegram runtime before MCP stdio connect.

- [ ] **Step 3: Implement eager readiness with injectable runner**

Change `src/cli/server.ts` so `runServer()` wires production dependencies and `runServerWithDeps()` performs the startup sequence with an owned runtime:

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfigFromDotenv } from "../config/config.js";
import { toPublicError } from "../domain/errors.js";
import { buildTelegramRuntime } from "../composition/create-app.js";
import { JsonFileLogger } from "../infra/logger.js";
import { createMcpServer } from "../interface/mcp-server.js";
import type { AppConfig } from "../config/config.js";
import type { AppLogger } from "../application/logger.js";
import type { TelegramRuntime } from "../composition/create-app.js";

export interface RunServerDeps {
  loadConfig: () => AppConfig;
  createLogger: (logPath: string) => AppLogger;
  buildRuntime: (config: AppConfig) => Promise<TelegramRuntime>;
  createServer: typeof createMcpServer;
  createTransport: () => StdioServerTransport;
}

export async function runServer(): Promise<void> {
  return runServerWithDeps({
    loadConfig: loadConfigFromDotenv,
    createLogger: (logPath) => new JsonFileLogger(logPath),
    buildRuntime: buildTelegramRuntime,
    createServer: createMcpServer,
    createTransport: () => new StdioServerTransport()
  });
}

export async function runServerWithDeps(deps: RunServerDeps): Promise<void> {
  let runtime: TelegramRuntime | undefined;
  try {
    const config = deps.loadConfig();
    const logger = deps.createLogger(config.logPath);
    await logger.info("server_starting", {
      operation: "mcp_server",
      correlation_id: `process-${process.pid}`,
      outcome: "started",
      pid: process.pid
    });
    runtime = await deps.buildRuntime(config);
    const server = deps.createServer(runtime.queries, { logger });
    await server.connect(deps.createTransport());
  } catch (error) {
    await disposeRuntime(runtime);
    process.stderr.write(`${JSON.stringify({ error: toPublicError(error) })}\n`);
    process.exitCode = 1;
  }
}
```

Remove or rewrite the `createLazyTelegramQueries` unit test that currently treats lazy Telegram connection as desired product behavior. Add a startup-cleanup test in `buildTelegramRuntime()` so a connected client is disconnected when authorization fails, and do not keep a production `buildTelegramQueries()` API that returns connected queries without a lifecycle owner.

- [ ] **Step 4: Run green tests**

Run:

```sh
npm test -- tests/unit/server.test.ts tests/unit/create-app.test.ts
npm run typecheck
```

Expected: both commands exit `0`.

- [ ] **Step 5: Run post-slice architecture review gate**

Use the mandatory gate above and append a `Slice 1: Server readiness is honest` entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`.

## Task 2: Stable `chat_ref` For Global Search Results

**Files:**
- Modify: `src/infra/telegram-normalizers.ts`
- Modify: `tests/adapter/telegram-client-adapter.test.ts`

- [ ] **Step 1: Write failing adapter test**

Add a test to `tests/adapter/telegram-client-adapter.test.ts`:

```ts
test("global search returns chat refs that keep access hashes for follow-up reads", async () => {
  const client = makeClient({});
  client.invoke.mockResolvedValueOnce({
    messages: [
      { id: 77, date: new Date("2026-05-10T10:00:00Z"), message: "hit", peerId: { channelId: "100" } }
    ],
    chats: [{ id: "100", accessHash: "200", title: "Private Channel" }],
    users: []
  });
  const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

  const result = await adapter.searchMessages({ query: "hit", limit: 10 });

  expect(parsePeerRef(result.messages[0]!.chat_ref)).toMatchObject({
    id: "100",
    accessHash: "200",
    title: "Private Channel",
    type: "channel"
  });
});
```

- [ ] **Step 2: Run red test**

Run: `npm test -- tests/adapter/telegram-client-adapter.test.ts -t "global search returns chat refs"`

Expected before implementation: failure because `accessHash` and `title` are missing from the normalized `chat_ref`.

- [ ] **Step 3: Implement entity map normalization**

In `src/infra/telegram-normalizers.ts`, update `normalizeGlobalSearchMessages` and `normalizeMessagesFromResponse` to build a peer entity map from `response.chats` and `response.users`. When a message peer id maps to an entity, use `chatSummaryFromEntity(entity).chat_ref`; otherwise fall back to the existing serialized peer id.

- [ ] **Step 4: Run green tests**

Run:

```sh
npm test -- tests/adapter/telegram-client-adapter.test.ts
npm run typecheck
```

Expected: both commands exit `0`.

- [ ] **Step 5: Run post-slice architecture review gate**

Use the mandatory gate above and append a `Slice 2: Stable chat_ref for global search results` entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`.

## Task 3: Date Window And Telegram Data Integrity

**Files:**
- Modify: `src/interface/tool-schemas.ts`
- Modify: `tests/interface/tool-schemas.test.ts`
- Modify: `src/infra/telegram-records.ts`
- Modify: `tests/adapter/telegram-client-adapter.test.ts`

- [ ] **Step 1: Write failing schema test**

Change the existing invalid date test to include reversed ranges:

```ts
expect(() =>
  toolSchemas.telegram_search_messages.parse({
    query: "x",
    from_date: "2026-05-15",
    to_date: "2026-05-08"
  })
).toThrow();
```

Also include malformed-but-parseable calendar values such as `2026-02-30`, invalid timestamps such as `2026-05-08T25:00:00Z`, and otherwise valid timestamp inputs such as `2026-05-08T10:00:00Z`. Tool schemas must accept only `YYYY-MM-DD` before a Telegram provider call. Date-only ranges are business day windows in UTC: `from_date: YYYY-MM-DD` starts at `00:00:00.000Z`, and `to_date: YYYY-MM-DD` ends at `23:59:59.999Z`.

- [ ] **Step 2: Write failing Telegram date test**

Add to adapter tests:

```ts
test("fails unsupported Telegram messages without valid dates", async () => {
  const chatRef = chatRefFor({ id: "1", type: "group", title: "Team" });
  const client = makeClient({
    entity: { id: "1", title: "Team" },
    messages: [{ id: 42, message: "missing date" }]
  });
  const adapter = new TelegramClientAdapter(client as unknown as GramJsLikeClient);

  await expect(adapter.getMessages({ chat_ref: chatRef, limit: 1 })).rejects.toMatchObject({
    code: "TELEGRAM_ERROR"
  });
});
```

Also cover invalid provider dates that can otherwise escape as raw `RangeError`, for example `new Date("bad")`, `Number.NaN`, and calendar-invalid strings such as `2026-02-30`.

- [ ] **Step 3: Write failing chat-scoped search window test**

Add an adapter test for `searchMessages({ chat_ref, from_date, to_date })` with one message inside the window, one on the final `to_date` day, and one before `from_date`. The result must include only the in-window messages; this proves the chat-scoped path enforces the same local date filter as folder/entity search and keeps date-only `to_date` inclusive for the whole day.

- [ ] **Step 4: Write failing global search window test**

Add an adapter test for global `searchMessages({ from_date, to_date })` where the provider response includes one message before the window, one on the final `to_date` day, and one after the window. The result must include only the in-window message even if Telegram returned out-of-window data.

- [ ] **Step 5: Run red tests**

Run:

```sh
npm test -- tests/interface/tool-schemas.test.ts tests/adapter/telegram-client-adapter.test.ts
```

Expected before implementation: reversed date range passes and missing date normalizes to 1970 instead of failing.

- [ ] **Step 6: Implement validation**

Add reusable strict date parsing functions in `src/domain/date-window.ts` and use date-only validation from `src/interface/tool-schemas.ts`, and apply it to all schemas that accept `from_date` and `to_date`. Change `normalizeDate` in `src/infra/telegram-records.ts` to throw `TELEGRAM_ERROR` on invalid or missing date values. Route chat-scoped `searchMessages` through the same filtered entity-search operation used by paged/folder searches. Route global search/page/media normalized results through local date filtering as well, and pass `to_date` to provider requests as end-of-day for date-only input.

- [ ] **Step 7: Run green tests**

Run:

```sh
npm test -- tests/interface/tool-schemas.test.ts tests/adapter/telegram-client-adapter.test.ts
npm run typecheck
```

Expected: both commands exit `0`.

- [ ] **Step 8: Run post-slice architecture review gate**

Use the mandatory gate above and append a `Slice 3: Date window and Telegram data integrity` entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`.

## Task 4: Safe Diagnostic Error Details

**Files:**
- Modify: `src/interface/mcp-server.ts`
- Modify: `tests/unit/create-app.test.ts`

- [ ] **Step 1: Write failing log-redaction test**

Add a test for `sanitizePublicErrorForLog` or exported equivalent:

```ts
expect(
  sanitizePublicErrorForLog({
    code: "CHAT_AMBIGUOUS",
    message: "Chat reference is ambiguous",
    details: {
      candidates: [
        { chat_ref: "secret-ref", title: "Private Team", username: "private_team", type: "group" }
      ]
    }
  })
).toEqual({
  code: "CHAT_AMBIGUOUS",
  message: "Chat reference is ambiguous",
  details: {
    candidates_count: 1
  }
});
```

- [ ] **Step 2: Run red test**

Run: `npm test -- tests/unit/create-app.test.ts -t "redacts public error details"`

Expected before implementation: helper is missing or raw details are returned.

- [ ] **Step 3: Implement sanitizer**

Export `sanitizePublicErrorForLog(error: PublicError): PublicError` from `src/interface/mcp-server.ts`. Use it in `tool_call_failed` log fields, but keep the MCP response unchanged so callers still get actionable ambiguity candidates.

- [ ] **Step 4: Run green tests**

Run:

```sh
npm test -- tests/unit/create-app.test.ts
npm run typecheck
```

Expected: both commands exit `0`.

- [ ] **Step 5: Run post-slice architecture review gate**

Use the mandatory gate above and append a `Slice 4: Safe diagnostic error details` entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`.

## Task 5: Decompose Telegram Client Adapter Per Query Scenario

**Files:**
- Modify: `src/infra/telegram-client-adapter.ts`
- Create: `src/infra/telegram-client-types.ts`
- Create: one file per Telegram query scenario under `src/infra/telegram-queries/`
- Modify: `src/infra/telegram-client.ts`
- Existing adapter tests remain the behavioral safety net.

- [ ] **Step 1: Capture current size smell**

Run:

```sh
wc -l src/infra/telegram-client-adapter.ts
rg -n "^  public async|^  private async" src/infra/telegram-client-adapter.ts
```

Expected before implementation: adapter is a large multi-responsibility module that mixes folder resolution, chat resolution, message search/history, threads, counters, participants, provider request construction, and folder expansion support.

- [ ] **Step 2: Refactor without changing behavior**

Split the adapter by query scenario:

- `telegram-client-types.ts`: shared `GramJsLikeClient` provider interface.
- `src/infra/telegram-queries/<operation>.ts`: one primary file per public `TelegramQueries` method, named after the business operation.
- Shared extraction modules are allowed only when they are named after a domain operation or contract, for example `folder-peer-entities.ts` or `search-global-messages.ts`.
- `telegram-client-adapter.ts`: thin composition root that implements `TelegramQueries` by delegating to the focused modules.

Do not create `helpers`, `utils`, `common`, or `misc` files. Keep import direction pointed inward and sideways only inside `infra`; do not move provider details into `application` or `interface`. Do not add new Telegram operations. This is a behavior-preserving refactor.

- [ ] **Step 3: Run green tests**

Run:

```sh
npm test -- tests/adapter/telegram-client-adapter.test.ts tests/unit/create-app.test.ts tests/interface/mcp-tools.test.ts
npm run typecheck
```

Expected: both commands exit `0`.

- [ ] **Step 4: Run post-slice architecture review gate**

Use the mandatory gate above and append a `Slice 5: Telegram client adapter decomposition` entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`.

## Task 6: Project-Owned Architecture Policy

**Files:**
- Create: `docs/project-arch-rules.md`

- [ ] **Step 1: Add repo-local policy**

Create `docs/project-arch-rules.md` with:

```md
# Telegram MCP Project Architecture Rules

This document is the repo-owned architecture policy for Telegram MCP. It was derived from the upstream AP baseline used during project review, but the rules below are the source of truth for this repository.

## Stage

Current stage: `mvp`.

The project is local-first, but it reads real user Telegram data, so privacy and auth-boundary rules are treated as release-blocking.

## Applicable Critical Rules

- AP-011: keep modules cohesive.
- PAR-001: each Telegram MCP tool/query scenario must have one primary module named after the business operation. Do not group new tool scenarios into broad `*-queries`, `helpers`, `utils`, `common`, or `misc` files.
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
```

- [ ] **Step 2: Verify docs are tracked**

Run: `git status --short docs/project-arch-rules.md`

Expected: `?? docs/project-arch-rules.md`

- [ ] **Step 3: Run post-slice architecture review gate**

Use the mandatory gate above and append a `Slice 6: Project-owned architecture policy` entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`.

## Task 7: Final Verification

**Files:**
- All modified files.

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: `Test Files 12 passed`, all tests passing.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: exit `0`.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: exit `0`.

- [ ] **Step 4: Review git diff**

Run: `git diff --stat && git diff --check`

Expected: no whitespace errors; diff limited to plan, docs, tests and architecture-hardening code.

## Task 8: Redacted Live Smoke Against A Real Telegram Account

**Files:**
- Create: `tools/live-smoke.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`

- [x] **Step 1: Add a live smoke runner without committing Telegram data**

Create a local runner that exercises live read-only tool handlers through the built MCP composition and prints only scenario names, success flags, counts, booleans, page order, and public error codes. It must not print chat titles, usernames, `chat_ref` values, folder refs, message ids, message text, session strings, phone numbers, or API credentials.

- [x] **Step 2: Add an npm entry point and README note**

Expose the runner as `npm run smoke:live` and document its redacted-output contract. Do not add any fixtures captured from a real Telegram account.

- [x] **Step 3: Run live examples**

Run `npm run smoke:live` against the configured local Telegram account. Expected: the command passes while printing only redacted metrics for folder, chat, recent-message, context, text-search, and media-search scenarios.

- [x] **Step 4: Run post-slice architecture review gate**

Use the mandatory gate above and append a `Slice 7: Redacted live smoke` entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`.

## Task 9: CI Build Checks And Full Tool Smoke Coverage

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `tools/live-smoke.mjs`
- Modify: `README.md`
- Modify: `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`

- [x] **Step 1: Add deterministic GitHub build checks**

Create a GitHub Actions workflow for push, pull request, and manual dispatch. It must run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm pack --dry-run`. Do not run live Telegram smoke in CI because it requires private Telegram credentials and session state.

- [x] **Step 2: Expand live smoke to every MCP tool handler**

Update the live smoke runner to attempt all MCP tool handlers. Keep output redacted and count-only. Mark Telegram-object-dependent checks such as thread, discussion, and participants as optional because a real account may not have a compatible object in the sampled chat.

- [x] **Step 3: Run verification**

Run local deterministic checks and `npm run smoke:live`. Expected: deterministic checks pass; live smoke reports all tool handlers attempted without printing private Telegram data.

- [x] **Step 4: Run post-slice architecture review gate**

Use the mandatory gate above and append a `Slice 8: CI build checks and full tool smoke coverage` entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`.

## Task 10: Public README Polish

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`

- [x] **Step 1: Reframe README for a cold open-source reader**

Use the same clarity pattern as the `ai-meatbags/arch-rules` README: explain why the project exists, what problem it solves, what is inside, how to use it, and what is explicitly out of scope. Keep the language appropriate for this repository: public-facing English, local-first Telegram safety boundary, and concrete setup commands.

- [x] **Step 2: Preserve required operational detail**

Keep setup, auth, Codex, Claude Code, live smoke, development, and architecture notes discoverable. Do not add private Telegram examples or project-local secrets.

- [x] **Step 3: Run post-slice architecture review gate**

Use the mandatory gate above and append a `Slice 9: Public README polish` entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`.

## Task 11: Russian README Localization

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`

- [x] **Step 1: Rewrite README in Russian**

Rewrite the public README in Russian to match the rest of the project documentation. Preserve English names for tool identifiers, environment variables, CLI commands, protocol names, and code-facing contracts.

- [x] **Step 2: Reader-test setup flow**

Cold-read the README as a new user and verify the path remains actionable: understand safety boundary, create `.env`, authenticate, build, connect Codex/Claude Code, and run smoke checks.

- [x] **Step 3: Run post-slice architecture review gate**

Use the mandatory gate above and append a `Slice 10: Russian README localization` entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`.

## Future Follow-Up

After this pass, do not add new Telegram tool families without first checking `docs/project-arch-rules.md` and the focused query modules for the correct owner. If a new tool crosses folder/chat/message/thread boundaries, add a small orchestrator instead of growing a broad adapter again.
