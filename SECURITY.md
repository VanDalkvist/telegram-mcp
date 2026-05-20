# Security Policy

`telegram-mcp` is local-first software that reads Telegram data through a user MTProto session. Security reports should focus on protecting the user's Telegram session, local credentials, private Telegram data, MCP tool contracts, and the read-only boundary.

## Supported Versions

This project is in MVP stage and does not maintain long-term support branches.

| Version or branch | Supported |
| --- | --- |
| Current `main` branch | Yes |
| Latest tagged release, when published | Yes |
| Older commits and untagged snapshots | No |

If a vulnerability affects an older commit, please reproduce it against current `main` before reporting when possible.

## Reporting a Vulnerability

Use GitHub's private vulnerability reporting flow for this repository when it is available:

1. Open the repository on GitHub.
2. Go to **Security**.
3. Select **Report a vulnerability**.
4. Include the smallest safe reproduction and the affected version or commit.

If private vulnerability reporting is unavailable, open a public GitHub issue with only a minimal request for a private maintainer contact. Do not include exploit details, Telegram session strings, API credentials, phone numbers, private message text, raw `chat_ref` values, raw `folder_ref` values, or full logs in a public issue.

Useful report details:

- affected version, commit, or branch;
- local OS and Node.js version;
- exact MCP tool name and redacted input shape;
- whether the issue requires a malicious MCP client, malicious Telegram data, local filesystem access, or maintainer/developer access;
- observed impact, such as credential exposure, private data exposure, read-only boundary break, or crash/denial of service;
- safe reproduction steps with all private Telegram data redacted.

Maintainer response targets:

- acknowledge a valid private report within 7 days;
- provide an initial triage decision within 14 days;
- coordinate disclosure timing after a fix or mitigation exists.

## Security Scope

In scope:

- Telegram session and API credential handling;
- local session file permissions;
- MCP tool input validation;
- `chat_ref`, `folder_ref`, and cursor parsing;
- private Telegram data leakage through logs, errors, DTOs, docs, package contents, or test fixtures;
- violations of the read-only tool boundary;
- unsafe Telegram provider response normalization;
- dependency vulnerabilities with a realistic path in this local MCP runtime.

Out of scope for the current MVP:

- hosted multi-user authorization;
- web browser vulnerabilities such as CSRF or XSS;
- database isolation or migrations;
- Bot API behavior;
- Telegram platform vulnerabilities outside this project;
- reports requiring the reporter to already control the user's local machine and Telegram session file, unless the project worsens exposure.

## Current Security Controls

- All MCP tools are intended to be read-only.
- Tool inputs are validated before Telegram calls.
- Startup fails before tools are exposed when config or Telegram session readiness is invalid.
- Diagnostic logs hash refs and cursors and record query lengths/counts instead of raw private values.
- Session files are written with restrictive permissions.
- Telegram provider data is normalized into explicit DTOs before MCP output.
- Regression tests cover known security fixes around folder exclusions and session file permissions.

## Security Audit History

### 2026-05-11 Codex Security Audit

Status: completed with fixes.

Summary: repository-wide Codex Security scan of the local-first Telegram MCP runtime. The scan found two issues:

- folder-scoped tools could return excluded chats;
- existing session file permissions could remain permissive.

Both issues were fixed and covered by regression tests.

Durable report: [Codex Security Audit 2026-05-11](docs/security/codex-security-audit-2026-05-11.md).

### 2026-05-20 Codex Security Diff Scan

Status: completed with no reportable findings.

Summary: diff-scoped Codex Security scan for the folder chat pagination MCP surface. The scan reviewed cursor handling, logging, read-only provider calls, raw GramJS DTO leakage risk, folder scoping, and dependency posture.

Result:

- no reportable findings;
- `npm audit --omit=dev --audit-level=moderate --json` reported zero vulnerabilities.

The scan summary is recorded in the architecture improvement ledger for this change.

## Dependency and Verification Checks

Security-relevant checks used during recent audits and fixes:

```sh
npm test
npm run typecheck
npm run build
npm pack --dry-run
git diff --check
npm audit --omit=dev --audit-level=moderate --json
```

These checks are useful evidence, but they do not guarantee absence of vulnerabilities.

## Disclosure Notes

Please give maintainers time to investigate and patch before public disclosure. Reports that include private Telegram data, secrets, session strings, or unredacted logs may need to be deleted or redacted before they can be handled safely.
