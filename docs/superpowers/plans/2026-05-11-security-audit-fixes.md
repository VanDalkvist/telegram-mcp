# Telegram MCP Security Audit Fixes Plan

Goal: close the two Codex Security findings from the repository-wide scan of commit `e124b8d`, preserve the local-first read-only architecture boundary, and publish a durable audit/disclaimer note in README.

Architecture Context Map:

- Product source of truth: `docs/design.md`.
- Project rules: `docs/project-arch-rules.md`.
- Security scan report: `/tmp/codex-security-scans/telegram-mcp/e124b8d_20260511T133214Z/report.md`.
- Runtime path: MCP tool input -> `src/interface/tool-schemas.ts` -> `src/infra/telegram-queries/*` -> GramJS read-only calls -> normalized DTO.
- Trusted boundary: local Telegram `StringSession`, `.env`, filesystem session/log paths.

Findings selected for fix-now:

- CAND-001 / P2: folder-scoped tools can return Telegram chats excluded from the selected dialog filter.
- CAND-002 / P3: overwriting an existing session file preserves permissive file permissions.

Explicit exclusions:

- No hosted auth, Bot API, write tools, media downloads, watchers, or webhooks.
- No broad normalizer decomposition in this cycle.
- No legal advice beyond an open-source-style README disclaimer based on existing MIT no-warranty language.

## Tasks

- [x] Slice 1: Folder membership security fix.
  - [x] Add failing adapter tests for explicit `includePeers` / `pinnedPeers` that are also present in `excludePeers`.
  - [x] Add failing adapter tests for rule-based folder exclusions from muted/read/archived dialogs.
  - [x] Run targeted red test: `npm test -- tests/adapter/telegram-client-adapter.test.ts`.
  - [x] Implement a single folder-membership control in focused domain-named modules, preserving `PAR-001`.
  - [x] Run targeted green test: `npm test -- tests/adapter/telegram-client-adapter.test.ts`.

- [x] Slice 2: Session file permission hardening.
  - [x] Add failing `FileSessionStore` test proving an existing `0644` session becomes `0600` after save.
  - [x] Run targeted red test: `npm test -- tests/unit/file-session-store.test.ts`.
  - [x] Implement atomic or explicit permission tightening without changing the auth boundary.
  - [x] Run targeted green test: `npm test -- tests/unit/file-session-store.test.ts`.

- [x] Slice 3: Durable audit docs and README disclaimer.
  - [x] Add a repo-local audit note under `docs/security/` that records the Codex Security audit, findings, fixes, and verification.
  - [x] Update README with a Security Audit section linking to that note.
  - [x] Add a Warranty and Liability section that points to the MIT no-warranty terms and states use is at the user's own risk.
  - [x] Validate docs with `git diff --check` and package dry run.

- [x] Final verification.
  - [x] Run `npm test`.
  - [x] Run `npm run typecheck`.
  - [x] Run `npm run build`.
  - [x] Run `npm pack --dry-run`.
  - [x] Append architecture review entry to `docs/superpowers/reviews/2026-05-11-telegram-mcp-arch-hardening-review.md`.
