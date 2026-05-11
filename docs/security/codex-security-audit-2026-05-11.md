# Codex Security Audit 2026-05-11

Статус: пройден с исправлениями.

Scope:

- Repository-wide scan текущей ветки `codex/telegram-mcp-arch-fixes`.
- Scan target commit до исправлений: `e124b8d`.
- Runtime focus: local-first read-only MCP server, Telegram MTProto user session, folder-scoped retrieval, local session storage.

Локальный bundle исходного скана:

- `/tmp/codex-security-scans/telegram-mcp/e124b8d_20260511T133214Z/report.md`

Этот путь является локальным артефактом Codex run. Durable summary хранится в этом файле, чтобы README ссылался на репозиторный source of truth.

## Findings

### CAND-001: Folder-scoped tools could return excluded chats

Priority: P2.

Problem:

- `excludePeers` применялся только к rule-based folder expansion.
- Explicit `pinnedPeers` / `includePeers` могли попасть в выдачу даже если тот же peer был в `excludePeers`.
- Rule flags `excludeMuted`, `excludeRead`, `excludeArchived` не учитывались там, где dialog metadata позволяла их проверить.

Fix:

- `src/infra/telegram-folder-expansion.ts` теперь строит общий exclusion set и проверяет rule-based exclusion flags.
- `src/infra/telegram-queries/folder-peer-entities.ts` применяет `excludePeers` к explicit peers и rule-derived entities.
- Добавлены regression tests для explicit include/pinned exclusions и rule-based muted/read/archived exclusions.

### CAND-002: Existing session file permissions could remain permissive

Priority: P3.

Problem:

- `writeFile(..., { mode: 0o600 })` защищал новый файл, но не менял права уже существующего session-файла.
- Если session-файл уже был `0644`, fresh Telegram `StringSession` сохранялся с прежними permissive permissions.

Fix:

- `src/infra/file-session-store.ts` теперь вызывает `chmod(this.sessionPath, 0o600)` после записи.
- Добавлен regression test, который начинает с существующего `0644` файла и проверяет итоговый mode `0600`.

## Verification

Commands run after fixes:

```sh
npm test -- tests/adapter/telegram-client-adapter.test.ts
npm test -- tests/unit/file-session-store.test.ts
npm test
npm run typecheck
npm run build
npm pack --dry-run
git diff --check
npm audit --omit=dev --audit-level=moderate --json
```

## Disclaimer Sources

README disclaimer follows the repository's MIT license posture:

- Open Source Initiative MIT text includes software provided as-is, without warranty, and no author/copyright-holder liability.
- ChooseALicense describes MIT limitations as no liability and no warranty.
- GitHub README documentation recommends README files communicate important project expectations and supports relative links to repo docs.
