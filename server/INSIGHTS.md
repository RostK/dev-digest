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

## Codebase Patterns

- 2026-06-16 — `@devdigest/shared` is vendored INDEPENDENTLY into server/src/vendor/shared/ and client/src/vendor/shared/ (one tsconfig path per app, NO sync script) — a contract change (new zod field, etc.) must be applied to BOTH copies or the apps drift. Ignore server/clones/RostK/dev-digest/** (a nested self-review checkout, not part of the build). Evidence: server/tsconfig.json paths; server/src/vendor/shared/contracts/{trace,platform}.ts.
- 2026-06-16 — GET routes declare only `params`/`body` schemas (fastify-type-provider-zod validates INPUT, not output), so a handler's returned object is serialized as-is — surface a new computed field (e.g. cost_usd) by adding it to the returned object + the vendored zod type, no response-schema change needed. Trade-off: response/contract drift is NOT caught at the route boundary; keep the vendored contract in sync by hand. Evidence: server/src/modules/pulls/routes.ts, server/src/modules/reviews/routes.ts.
- 2026-06-16 — For "latest row per PR" lookups use `db.selectDistinctOn([t.agentRuns.prId], {…}).where(… status='done').orderBy(t.agentRuns.prId, desc(t.agentRuns.ranAt))` — one row per PR resolved in Postgres — NOT fetch-all-rows-then-dedup-in-JS (unbounded as re-reviews accumulate). agent_runs had NO prId index; added composite (pr_id, status, ran_at) where the status equality also satisfies the (pr_id, ran_at) ordering. NB the latest-review-score lookup in the same route still uses the JS-dedup pattern (pre-existing). Evidence: server/src/modules/pulls/routes.ts (latestRunCostByPr), server/src/db/schema/runs.ts (agent_runs_pr_status_ran_at_idx).

## Decisions

- 2026-06-16 — Per-run cost is DERIVED at read-time (`tokens × pricing` via `runCostUsd`), never stored on `agent_runs` — its cost column was dropped (migration 0009 / commit `d45ab0d` "keep model pricing"). Compute it in the GET-route mappers: `listRunsForPull`, the pulls-list route (PR's latest `done` run), and `getRunTrace` stats enrichment. `ci_runs` is the exception — it keeps a real `cost_usd` column (external CI reports cost). Failed/unpriced/0-token runs → null → "—", never "$0.00". Evidence: server/src/adapters/llm/pricing.ts (runCostUsd), modules/reviews/repository/run.repo.ts, modules/pulls/routes.ts, modules/reviews/service.ts.
- 2026-06-16 — Settings test-connection validates an OpenRouter key via the
  AUTHENTICATED `GET /api/v1/key` (and rejects Provisioning keys), NOT `listModels()`.
  Reason: OpenRouter's `/models` is public, so the old `listModels()` check showed a
  green "OK — N models" for revoked/wrong keys that then 401 on every review. Evidence:
  server/src/modules/settings/routes.ts (openrouter branch).

## Tool & Library Notes

- 2026-06-16 — `cd server && pnpm test` reports 6 PRE-EXISTING failures in test/indexer-pipeline.test.ts (`ENOENT … repo-intel-inc-*/src/a.ts` from its own `writeFileAt` temp-dir helper) — a Windows FS flake that reproduces in isolation AND on a clean `git stash` tree, i.e. baseline noise unrelated to feature work. To validate non-indexer changes, run targeted suites instead, e.g. `pnpm vitest run test/contracts.test.ts test/pulls-status.test.ts test/reviews-helpers.test.ts`. Evidence: test/indexer-pipeline.test.ts:144.
- 2026-06-16 (correction to the above) — NOT a flake: it's a deterministic Windows path-separator bug in `writeFileAt`. It derived the parent dir via `full.lastIndexOf('/')`, but `join()` yields backslash separators on Windows, so the search never matched, the `mkdir` was skipped, and `writeFile` failed for any subdir fixture (e.g. `src/a.ts`). Fixed by using `dirname()` (PR #3). Lesson: derive a path's parent with `dirname()` (node:path), never a hardcoded `/` search — dev/CI run on Windows too. Evidence: test/indexer-pipeline.test.ts:140 (writeFileAt).

## Recurring Errors & Fixes

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
- 2026-06-16 — Reworked the pulls-list cost query (review feedback): replaced
  fetch-all-done-runs + JS dedup with DISTINCT ON (pr_id) + a composite
  (pr_id, status, ran_at) index (migration 0010). See Codebase Patterns.
- 2026-06-16 — Added per-run cost/tokens end-to-end (cost_usd on RunSummary/RunStats/PrMeta in both vendor copies; `runCostUsd` helper; surfaced in 3 GET routes). Chose compute-at-read over re-adding the dropped cost column. See Decisions + Codebase Patterns + Tool & Library Notes.

## Open Questions
