# INSIGHTS — e2e (`@devdigest/e2e`)

Durable engineering learnings for the deterministic browser end-to-end suite
(Vercel agent-browser; no Playwright, no LLM), captured by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md) skill. Covers
all `e2e/**` work — the runner (`run.ts`), the flow-spec convention (`specs/*.flow.json`),
and the isolated `scripts/e2e.sh` harness.

**append-only** · one concrete, actionable-"cold" record per line · re-read before
adding (never duplicate) · skip the obvious.

Record format: `- YYYY-MM-DD — <actionable statement>. Evidence: path/file.ts:line.`

> Empty sections are intentional — they fill up only as real, non-obvious learnings
> surface. Don't pad them.

## What Works

## What Doesn't Work

- 2026-07-07 — A flow's `wait --text "N findings"` (any hardcoded seeded-count assertion) SILENTLY rots when the seed changes: flow 04 asserted "2 findings", but a later lesson grew PR #482's seeded review 2 → 8 findings (server/src/db/seed.ts) without touching the flow, so the accordion header renders "8 findings" and the wait times out after 30s — right after the verdict step passes, which reads like a render bug but is a stale expectation. When you change a seed count, grep e2e/specs for the old number; prefer asserting a STABLE fact (a specific finding TITLE — flow 04 already does) over a drift-prone count. Evidence: e2e/specs/04-pr-findings.flow.json, server/src/db/seed.ts (PR #482 findings), commit 61b5d97.

## Codebase Patterns

- 2026-07-07 — Every flow asserts against `pnpm db:seed` output, so any count/text it checks is COUPLED to server/src/db/seed.ts — an unrelated server-side seed edit can turn a flow red with no e2e change. The e2e-web CI workflow is also NEW (first ran 2026-07-07 on feat/l06-eval-custom), so flows that had silently drifted on `main` only surface now — a red e2e check here is often pre-existing drift, not the current branch's doing (confirm with `git diff main -- e2e/ server/src/db/seed.ts`). Evidence: e2e/specs/*.flow.json, server/src/db/seed.ts.

## Decisions

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
