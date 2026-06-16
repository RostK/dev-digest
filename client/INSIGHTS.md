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

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

- 2026-06-16 — Added per-run cost/token display (`RunCostBadge`, 2 variants: compact `$0.012` / detailed `$0.014 · 8.2K→1.3K`, `—` for null) to the PR list COST column, the verdict card header + verdict banner, and the Run Trace stats tile. Badge only formats; cost is server-computed. See Codebase Patterns.

## Open Questions
