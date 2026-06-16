# INSIGHTS — client (`@devdigest/web`)

Durable engineering learnings for the Next.js studio UI, captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) skill.

**append-only** · one concrete, actionable-"cold" record per line · re-read before
adding (never duplicate) · skip the obvious.

Record format: `- YYYY-MM-DD — <actionable statement>. Evidence: path/file.ts:line.`

> Empty sections are intentional — they fill up only as real, non-obvious learnings
> surface. Don't pad them.

## What Works

- 2026-06-16 — Lazy "fetch on hover" for PR-list rows: `usePrReviews(prId, { enabled })` gated on a per-row hover flag (set once via the hover card's `onOpen`), sharing the `["reviews", prId]` query key so the count chips show instantly (from `pr.findings`) while the title list loads only when hovered — and the PR-detail page is warm afterwards. Prefer adding an optional `{ enabled }` to the existing query hook over writing a second hook. Evidence: client/src/lib/hooks/reviews.ts (usePrReviews), client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx.

## What Doesn't Work

- 2026-06-16 — A `position:absolute` dropdown/popover anchored to a PR-list ROW gets clipped: the table card (`s.tableCard`) sets `overflow:hidden` (for rounded row corners), which clips ALL absolutely-positioned descendants. The house `Dropdown` only works there because it sits at the table top and opens downward within the tall card. For a hover card on an arbitrary row, render it via `createPortal(…, document.body)` with `position:fixed` measured from the trigger's `getBoundingClientRect()` (add a small close-delay so crossing the gap to the portaled card doesn't dismiss it). Evidence: client/src/app/repos/[repoId]/pulls/styles.ts (tableCard), client/src/components/SeverityIndicators/FindingsHoverCard.tsx.

## Codebase Patterns

- 2026-06-16 — `SeverityBadge` in `compact` mode renders icon + count ONLY (no text label), so it exposes just a bare number to screen readers and is untargetable by `getByText`. Wrap each chip in a span with `title`+`aria-label` (e.g. `"2 Critical"` from `SEV[sev].label`) — gives a hover tooltip, an accessible name, AND a stable test handle (`getByTitle("2 Critical")`; `getByLabelText` is unreliable on a plain span). Evidence: client/src/components/SeverityIndicators/SeverityIndicators.tsx.
- 2026-06-16 — A PR's "findings" = OPEN findings summed across ALL its reviews, NOT the latest review. A multi-agent review pass writes ONE `reviews` row per agent (General/Security/Performance), each with its own `run_id` and `created_at` seconds apart — so "latest single review" silently drops the other agents' findings (caught when a PR's WARNING from one agent vanished because two clean agents reviewed milliseconds later). The PR-detail page is the reference: it does `runs.flatMap(r => r.findings)` over every review. The PR-list cluster (server) and its hover card (`reviewsQ.data.flatMap(r => r.findings)` → `openFindings`) must do the same or list and detail disagree. Evidence: client/src/app/repos/[repoId]/pulls/[number]/page.tsx (allFindings flatMap), PRRow.tsx (hoverFindings), server pulls/routes.ts (severityByPr join).

- 2026-06-16 — Review-run cards render `ReviewRecord` (reviews table: verdict/score/findings) which has NO tokens or cost — those live on `RunSummary` (agent_runs), keyed by `run_id`. PR Detail already fetches both (`usePrReviews` + `usePrRuns`); match `review.run_id → RunSummary` in `FindingsTab` and pass the run into the accordion rather than widening the reviews query. Evidence: client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx (runById map), ReviewRunAccordion.tsx.
- 2026-06-16 — Adding a Pull Requests list column = add the key to `COLUMN_KEYS` + widen the `GRID` template string (both in pulls/constants.ts) + add a cell to PRRow.tsx in the SAME position (cells render in fixed order — there is no key→cell mapping) + add i18n `prReview.list.columns.<key>`. The header row auto-maps labels from COLUMN_KEYS; GRID drives both headRow and rows. Evidence: client/src/app/repos/[repoId]/pulls/constants.ts, _components/PRRow/PRRow.tsx, styles.ts.
- 2026-06-16 — `@devdigest/shared` is a per-app VENDORED copy (client/src/vendor/shared/, via tsconfig path) — a zod contract change must be made identically in server/src/vendor/shared/ too; there is no sync script between them. Evidence: client/tsconfig.json paths; client/src/vendor/shared/contracts/{trace,platform}.ts.

## Decisions

- 2026-06-16 — Per-run cost is formatted at DIFFERENT precision per surface, on purpose: 2–3 dp compact (`formatCostCompact`) for the PR-list column + verdict card header, but 4 dp (`formatCostPrecise`) for the dense PR timeline usage line — sub-cent runs ($0.0013 vs $0.0014) must stay distinguishable there, where 3 dp would collapse both to "$0.001". Don't "unify" the formatters. Evidence: client/src/components/RunCostBadge/format.ts.
- 2026-06-16 — Severity counts are computed in TWO places with DIFFERENT scopes, on purpose: server `rollupSeverities` for the PR-LIST cluster = open findings across ALL of a PR's reviews (per-PR rollup); client `countsOf` for the PR-detail TIMELINE = open findings of ONE run (per-run, keyed by run_id). Both share the OPEN (non-dismissed) rule but are NOT the same aggregation — the list answers "what's open on this PR", the timeline row answers "what did this run find". Don't unify them. Evidence: client/src/components/SeverityIndicators/helpers.ts (countsOf), server/src/modules/pulls/status.ts (rollupSeverities), routes.ts (severityByPr).

## Tool & Library Notes

- 2026-06-16 — Adding a NEW named export to an existing module/barrel while `pnpm dev` is running makes Next.js (webpack) serve a STALE copy of that barrel → `(0, _mod.fn) is not a function` at runtime, even though `tsc` and `vitest` both pass (they execute the real module). It's an HMR cache miss, not a code bug — restart `pnpm dev` (and `rm -rf .next` if it persists); do not "fix" the export. Evidence: client/src/components/RunCostBadge/index.ts (added formatTokensTotal/formatCostPrecise), consumed by RunHistory.tsx.

## Recurring Errors & Fixes

## Session Notes

- 2026-06-16 — Added per-run cost/token display (`RunCostBadge`, 2 variants: compact `$0.012` / detailed `$0.014 · 8.2K→1.3K`, `—` for null) to the PR list COST column, the verdict card header + verdict banner, and the Run Trace stats tile. Badge only formats; cost is server-computed. See Codebase Patterns.
- 2026-06-16 — Added a 5th surface: the PR timeline (RunHistory) rows now show "9,119 tok · $0.0013" (comma-grouped total tokens + 4-dp cost) under the timestamp, for settled runs only. Client-only — RunSummary already carries tokens_in/out + cost_usd. See Decisions (per-surface precision).
- 2026-06-16 — Added severity indicators (CRITICAL/WARNING/SUGGESTION icon+count cluster + a lazy hover card listing findings) to the PR-list (new Findings column) and the PR-detail timeline rows. New shared `components/SeverityIndicators/` with its OWN barrel (dodges the stale-barrel HMR gotcha — see Tool & Library Notes). Server half (per-PR open-finding counts on the list payload) was finished alongside. See What Works / What Doesn't Work / Codebase Patterns / Decisions.

## Open Questions
