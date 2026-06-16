# INSIGHTS — server (`@devdigest/api`)

Durable engineering learnings for the Fastify + Drizzle/Postgres API, captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) skill. Covers
all `server/**` work except the `repo-intel` module, which keeps its own
`server/src/modules/repo-intel/INSIGHTS.md`.

**append-only** · one concrete, actionable-"cold" record per line · re-read before
adding (never duplicate) · skip the obvious.

Record format: `- YYYY-MM-DD — <actionable statement>. Evidence: path/file.ts:line.`

> Empty sections are intentional — they fill up only as real, non-obvious learnings
> surface. Don't pad them.

## What Works

## What Doesn't Work

- 2026-06-16 — POSIX-only path/URL string assumptions keep breaking on Windows (dev AND CI run on Windows here). Seen twice: building a file URL via `` `file://${process.argv[1]}` `` (migrate.ts) and deriving a parent dir via `lastIndexOf('/')` (indexer test). Always use node:url `pathToFileURL`/`fileURLToPath` for file URLs and node:path `dirname`/`join` for paths — never hand-concatenate `/` or `file://`. Evidence: server/src/db/migrate.ts; test/indexer-pipeline.test.ts.

## Codebase Patterns

## Decisions

- 2026-06-16 — Settings test-connection validates an OpenRouter key via the
  AUTHENTICATED `GET /api/v1/key` (and rejects Provisioning keys), NOT `listModels()`.
  Reason: OpenRouter's `/models` is public, so the old `listModels()` check showed a
  green "OK — N models" for revoked/wrong keys that then 401 on every review. Evidence:
  server/src/modules/settings/routes.ts (openrouter branch).

## Tool & Library Notes

## Recurring Errors & Fixes

- 2026-06-16 — `pnpm db:migrate` silently does NOTHING on Windows: it exits 0, prints no "✓ migrations applied", and applies no migration — symptom is an "applied" migration whose new table/index is still missing. Cause: the CLI guard `import.meta.url === `file://${process.argv[1]}`` never matches (import.meta.url is `file:///C:/…`; argv[1] is a backslash path). Fix: `pathToFileURL(process.argv[1]).href` (+ a truthy guard on argv[1] for noUncheckedIndexedAccess). Evidence: server/src/db/migrate.ts (CLI entrypoint), PR #4.
- 2026-06-16 — OpenRouter reviews fail with `401 {"error":{"message":"User not found"}}`
  when the stored `OPENROUTER_API_KEY` is revoked/unknown or a Provisioning key — NOT
  when it's missing (a missing key throws `ConfigError: OPENROUTER_API_KEY is not
  configured` first). Fix: set a real API key in Settings→API Keys; it persists to
  `~/.devdigest/secrets.json` (which OVERRIDES env) and calls `invalidateSecretCaches()`
  so it's live without a restart. Evidence: server/src/platform/container.ts:183,
  server/src/adapters/secrets/local.ts:39.

## Session Notes

- 2026-06-16 — Debugged PR-review runs all erroring "401 User not found": root cause was
  a Provisioning key stored as `OPENROUTER_API_KEY`; the studio's test-connection gave a
  false green (it pinged the public `/models`). Fixed the test to authenticate and
  replaced the key with a real inference key. See Decisions + Recurring Errors & Fixes.
- 2026-06-16 — Fixed `pnpm db:migrate` no-op on Windows (entrypoint guard) — surfaced when
  an "applied" migration left its index missing. See What Doesn't Work + Recurring Errors.

## Open Questions
