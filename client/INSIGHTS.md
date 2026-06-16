# INSIGHTS — client (`@devdigest/web`)

Durable engineering learnings for the Next.js studio UI, captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) skill.

**append-only** · one concrete, actionable-"cold" record per line · re-read before
adding (never duplicate) · skip the obvious.

Record format: `- YYYY-MM-DD — <actionable statement>. Evidence: path/file.ts:line.`

> Empty sections are intentional — they fill up only as real, non-obvious learnings
> surface. Don't pad them.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-06-16 — Review-run cards render `ReviewRecord` (reviews table: verdict/score/findings) which has NO tokens or cost — those live on `RunSummary` (agent_runs), keyed by `run_id`. PR Detail already fetches both (`usePrReviews` + `usePrRuns`); match `review.run_id → RunSummary` in `FindingsTab` and pass the run into the accordion rather than widening the reviews query. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx (runById map), ReviewRunAccordion.tsx.
- 2026-06-16 — Adding a Pull Requests list column = add the key to `COLUMN_KEYS` + widen the `GRID` template string (both in pulls/constants.ts) + add a cell to PRRow.tsx in the SAME position (cells render in fixed order — there is no key→cell mapping) + add i18n `prReview.list.columns.<key>`. The header row auto-maps labels from COLUMN_KEYS; GRID drives both headRow and rows. Evidence: client/src/app/repos/[repoId]/pulls/constants.ts, _components/PRRow/PRRow.tsx, styles.ts.
- 2026-06-16 — `@devdigest/shared` is a per-app VENDORED copy (client/src/vendor/shared/, via tsconfig path) — a zod contract change must be made identically in server/src/vendor/shared/ too; there is no sync script between them. Evidence: client/tsconfig.json paths; client/src/vendor/shared/contracts/{trace,platform}.ts.

## Decisions

- 2026-06-16 — Per-run cost is formatted at DIFFERENT precision per surface, on purpose: 2–3 dp compact (`formatCostCompact`) for the PR-list column + verdict card header, but 4 dp (`formatCostPrecise`) for the dense PR timeline usage line — sub-cent runs ($0.0013 vs $0.0014) must stay distinguishable there, where 3 dp would collapse both to "$0.001". Don't "unify" the formatters. Evidence: client/src/components/RunCostBadge/format.ts.

## Tool & Library Notes

- 2026-06-16 — Adding a NEW named export to an existing module/barrel while `pnpm dev` is running makes Next.js (webpack) serve a STALE copy of that barrel → `(0, _mod.fn) is not a function` at runtime, even though `tsc` and `vitest` both pass (they execute the real module). It's an HMR cache miss, not a code bug — restart `pnpm dev` (and `rm -rf .next` if it persists); do not "fix" the export. Evidence: client/src/components/RunCostBadge/index.ts (added formatTokensTotal/formatCostPrecise), consumed by RunHistory.tsx.

## Recurring Errors & Fixes

## Session Notes

- 2026-06-16 — Added per-run cost/token display (`RunCostBadge`, 2 variants: compact `$0.012` / detailed `$0.014 · 8.2K→1.3K`, `—` for null) to the PR list COST column, the verdict card header + verdict banner, and the Run Trace stats tile. Badge only formats; cost is server-computed. See Codebase Patterns.
- 2026-06-16 — Added a 5th surface: the PR timeline (RunHistory) rows now show "9,119 tok · $0.0013" (comma-grouped total tokens + 4-dp cost) under the timestamp, for settled runs only. Client-only — RunSummary already carries tokens_in/out + cost_usd. See Decisions (per-surface precision).

## Open Questions
