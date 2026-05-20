# Folder Chat Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only MCP tool that pages through every chat in a resolved Telegram folder with a stable cursor.

**Architecture:** Keep MCP handlers thin: validate input with Zod, call the application query port, return explicit DTOs. Keep GramJS pagination details inside one focused infra operation module, using `getDialogs({ folder, offsetDate, offsetId, offsetPeer })` and a cursor derived from the last raw dialog in the Telegram page. Leave folder-wide message fanout unchanged.

**Tech Stack:** Node.js 22+, TypeScript, Vitest, Zod, GramJS `telegram`, MCP stdio.

---

## Arch Loop Context

- Stage: `mvp`.
- Branch: `codex/telegram-mcp-arch-fixes`.
- Worktree status before plan: clean.
- Memory used: global Telegram MCP memory entries about folder tools, `Env (1d)` with 131 peers, ports/adapters, and fail-fast validation.
- Project source docs: `docs/design.md`, `docs/project-arch-rules.md`, `README.md`.
- External contract checked: GramJS `messages.GetDialogs` supports `offsetDate`, `offsetId`, `offsetPeer`, `limit`, and `folderId`; GramJS `getDialogs` accepts `offsetDate`, `offsetId`, `offsetPeer`, and `folder`.
- Baseline verification before plan: `npm test` passed with 12 files and 69 tests; `npm run typecheck` exited 0.

## Architecture Context Map

- Stage: `mvp`.
- Source docs: `docs/design.md`, `docs/project-arch-rules.md`.
- Active paths: `src/interface/tool-schemas.ts`, `src/interface/mcp-tools.ts`, `src/interface/mcp-server.ts`, `src/application/telegram-queries.ts`, `src/infra/telegram-client-adapter.ts`, `src/infra/telegram-queries/`.
- Critical AP gates: AP-012, AP-020, AP-021, AP-025, AP-026, AP-032, AP-042, AP-043, PAR-001.
- Baseline AP gates: AP-011, AP-013, AP-022, AP-023, AP-027, AP-039/AP-040.
- Not applicable: frontend rules, database rules, hosted multi-user auth rules.
- Deviations: none.
- Plan decisions still open: none for this slice.

## Findings And Triage

- [P1] Folder inventory cannot be paged through the MCP surface - fix-now
  - Evidence: `telegram_list_folder_chats` has no `cursor`, `limit` is max 100, and `getFolderPeerEntities(...).slice(0, limit)` truncates the folder inventory.
  - Impact: event and inbox extraction cannot honestly cover folders such as `Env (1d)` with 131 chats.
  - Rule: AP-026, AP-043, PAR-001.
- [P2] Existing docs describe folder search pagination as bounded best-effort without a separate folder inventory page contract - fix-now
  - Evidence: `docs/design.md` states folder scoped message page has no stable cursor.
  - Impact: downstream users can miss the intended new path after the API changes.
  - Rule: AP-026.
- [P3] Existing `telegram_list_folder_chats` bounded behavior is still useful for small folders and compatibility - log-only
  - Evidence: current tests cover explicit and rule-based folder expansion.
  - Impact: replacing it would create avoidable compatibility risk.
  - Rule: AP-020, AP-026.

## File Structure

- Modify `src/domain/types.ts`: add `ChatPage`.
- Modify `src/application/telegram-queries.ts`: add `ListFolderChatsPageInput` and `listFolderChatsPage`.
- Modify `src/interface/tool-schemas.ts`: add `telegram_list_folder_chats_page` input schema with optional `cursor`.
- Modify `src/interface/mcp-tools.ts`: delegate the new tool to `queries.listFolderChatsPage`.
- Modify `src/interface/mcp-server.ts`: register the new tool.
- Modify `src/infra/telegram-client-types.ts`: allow dialog pagination params used by GramJS.
- Modify `src/infra/telegram-client-adapter.ts`: keep it a thin delegator for `listFolderChatsPage`.
- Modify `src/infra/telegram-queries/folder-peer-entities.ts`: export folder filter lookup for fail-fast folder validation.
- Create `src/infra/telegram-queries/list-folder-chats-page.ts`: own GramJS folder pagination, cursor encode/decode, normalization, and type filtering.
- Modify `tests/interface/tool-schemas.test.ts`: cover schema/default/cursor validation.
- Modify `tests/interface/mcp-tools.test.ts`: cover handler delegation.
- Modify `tests/adapter/telegram-client-adapter.test.ts`: cover RED/GREEN page cursor behavior and invalid cursor failure.
- Modify `README.md` and `docs/design.md`: document the new folder inventory page tool.

## Task 1: RED Tests For Public MCP Contract

**Files:**
- Modify: `tests/interface/tool-schemas.test.ts`
- Modify: `tests/interface/mcp-tools.test.ts`

- [ ] **Step 1: Add schema expectation**

Add this assertion in the folder/chat schema test:

```ts
expect(toolSchemas.telegram_list_folder_chats_page.parse({ folder_ref: "folder-ref", cursor: "next" })).toEqual({
  folder_ref: "folder-ref",
  cursor: "next",
  limit: 50,
  type: "any"
});
```

- [ ] **Step 2: Add handler delegation case**

Add a `listFolderChatsPage` mock and a delegation case:

```ts
{
  tool: "telegram_list_folder_chats_page",
  query: "listFolderChatsPage",
  input: { folder_ref: "folder-ref", cursor: "next" },
  expectedInput: { folder_ref: "folder-ref", cursor: "next", limit: 50, type: "any" }
}
```

- [ ] **Step 3: Run targeted RED**

Run:

```sh
npm test -- tests/interface/tool-schemas.test.ts tests/interface/mcp-tools.test.ts
```

Expected: fail because `telegram_list_folder_chats_page` and `listFolderChatsPage` do not exist yet.

## Task 2: RED Tests For Adapter Pagination

**Files:**
- Modify: `tests/adapter/telegram-client-adapter.test.ts`

- [ ] **Step 1: Add cursor pagination test**

Add a test that:

```ts
const firstPage = await adapter.listFolderChatsPage({ folder_ref: folderRef, limit: 1, type: "any" });
expect(firstPage.chats.map((chat) => chat.title)).toEqual(["Env Alpha"]);
expect(firstPage.page.next_cursor).toEqual(expect.any(String));
expect(client.getDialogs).toHaveBeenCalledWith({ folder: 7, limit: 1 });

client.getDialogs.mockResolvedValueOnce(secondDialogs);
const secondPage = await adapter.listFolderChatsPage({
  folder_ref: folderRef,
  limit: 1,
  type: "any",
  cursor: firstPage.page.next_cursor
});
expect(secondPage.chats.map((chat) => chat.title)).toEqual(["Env Beta"]);
expect(client.getDialogs).toHaveBeenLastCalledWith({
  folder: 7,
  limit: 1,
  offsetDate: 1779285600,
  offsetId: 20,
  offsetPeer: expect.any(Api.InputPeerChannel),
  ignorePinned: true
});
```

- [ ] **Step 2: Add invalid cursor test**

Add:

```ts
await expect(
  adapter.listFolderChatsPage({ folder_ref: folderRef, limit: 1, type: "any", cursor: "not-json" })
).rejects.toMatchObject({ code: "CONFIG_INVALID" });
```

- [ ] **Step 3: Run targeted RED**

Run:

```sh
npm test -- tests/adapter/telegram-client-adapter.test.ts
```

Expected: fail because `listFolderChatsPage` is missing.

## Task 3: Minimal Implementation

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/application/telegram-queries.ts`
- Modify: `src/interface/tool-schemas.ts`
- Modify: `src/interface/mcp-tools.ts`
- Modify: `src/interface/mcp-server.ts`
- Modify: `src/infra/telegram-client-types.ts`
- Modify: `src/infra/telegram-client-adapter.ts`
- Modify: `src/infra/telegram-queries/folder-peer-entities.ts`
- Create: `src/infra/telegram-queries/list-folder-chats-page.ts`

- [ ] **Step 1: Add DTO and application port**

Add:

```ts
export interface ChatPage {
  order: "recent_first";
  next_cursor?: string;
}
```

Add:

```ts
export interface ListFolderChatsPageInput extends ListChatsInput {
  folder_ref: string;
  cursor?: string | undefined;
}
```

Add `listFolderChatsPage(input): Promise<{ chats: ChatSummary[]; page: ChatPage }>` to `TelegramQueries`.

- [ ] **Step 2: Add schema, handler, and registration**

Add schema:

```ts
telegram_list_folder_chats_page: z.object({
  folder_ref: folderRef,
  limit: z.number().int().positive().max(100).default(50),
  type: typeSchema,
  cursor: z.string().trim().min(1).optional()
})
```

Add handler delegation and MCP registration with a description that says it pages through folder chats with a cursor.

- [ ] **Step 3: Add focused infra operation**

Create `list-folder-chats-page.ts` with:

```ts
const cursor = parseFolderChatCursor(input.cursor);
const folder = parseFolderRef(input.folder_ref);
await getFolderFilterById(context, folder.id);
const dialogs = await context.client.getDialogs({
  folder: folder.id,
  limit: input.limit,
  ...cursor.dialogParams
});
const chats = dialogs.map((dialog) => chatSummaryFromDialog(dialog)).filter((chat) => matchesType(chat, input.type));
return { chats, page: pageForFolderDialogs(dialogs, input.limit) };
```

Cursor rules:

- Decode with `Buffer.from(value, "base64url")`.
- Require `offset_date`, `offset_id`, and `offset_peer` together.
- Convert `offset_peer` from `chat_ref` through `parsePeerRef` and `entityLookupFromPeer`.
- Add `ignorePinned: true` on cursor pages.
- Throw `CONFIG_INVALID` for malformed cursor input.
- Throw typed `TELEGRAM_ERROR` if Telegram returns a full page but the last dialog lacks message id, date, or chat ref data needed for the next cursor.

- [ ] **Step 4: Wire adapter**

Import `listFolderChatsPage` and add a thin delegator method.

- [ ] **Step 5: Run targeted GREEN**

Run:

```sh
npm test -- tests/interface/tool-schemas.test.ts tests/interface/mcp-tools.test.ts tests/adapter/telegram-client-adapter.test.ts
```

Expected: pass.

## Task 4: Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/design.md`

- [ ] **Step 1: Update tool list**

Add `telegram_list_folder_chats_page` to the Folders row.

- [ ] **Step 2: Add design section**

Document inputs and output:

```md
### `telegram_list_folder_chats_page`

Постранично читает chats внутри resolved Telegram dialog filter/folder.

Inputs:

- `folder_ref`: string.
- `limit`: number, default 50, max 100.
- `type`: optional enum `any`, `channel`, `group`, `user`.
- `cursor`: optional string returned by previous page.

Output:

- `chats`: array of chat summaries.
- `page`: `{ order: "recent_first", next_cursor?: string }`.
```

- [ ] **Step 3: Clarify message search boundary**

Keep `telegram_search_messages_page` folder scope documented as bounded best-effort for message fanout, and point users to `telegram_list_folder_chats_page` for full folder inventory.

## Task 5: Verification And Architecture Review

**Files:**
- Inspect: full diff
- Update: `docs/arch-improvement/review-log.md`

- [ ] **Step 1: Run full verification**

Run:

```sh
npm test
npm run typecheck
npm run build
git diff --check
```

- [ ] **Step 2: Architecture review**

Check AP gates:

- AP-020/AP-021/AP-025: entry points are thin and dependencies still point inward.
- AP-026/AP-043: schema and DTO are explicit and validated.
- AP-032: new tool is read-only.
- AP-042: cursor and logs do not add secret/session output.
- PAR-001: new provider behavior lives in `list-folder-chats-page.ts`.

- [ ] **Step 3: Ledger**

Append the cycle context, findings, fixes, verification, residual risk, and lessons to `docs/arch-improvement/review-log.md`.

## Task 6: Codex Security Scan

**Files:**
- Create scan artifacts under the Codex Security scan path selected by the security workflow.
- Modify code only if validation produces reportable findings.

- [ ] **Step 1: Run Codex Security phases**

Run the security workflow in order:

1. threat model
2. finding discovery
3. validation
4. attack-path analysis
5. final report

- [ ] **Step 2: Fix validated findings**

For each reportable finding, write a targeted failing test when the issue is behavioral, patch the smallest code path, rerun targeted and full verification, and update the security report with the fix outcome.

- [ ] **Step 3: Final verification**

Rerun:

```sh
npm test
npm run typecheck
npm run build
git diff --check
```
