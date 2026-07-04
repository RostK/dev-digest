# retros — multi-agent workflow retrospectives

Per-run reports produced by the `/review-run` skill after a multi-agent workflow (the SDD
`/implement` pipeline, or any fan-out of subagents). Each captures how the **orchestration** went —
agents launched, launch order, per-agent tokens / tool-uses / duration, failures & retries,
parallelism, what was hard / duplicated / missed, and recommendations to tune the workflow.

## What this is NOT
- **Not** code learnings — those go to a module's `INSIGHTS.md` via `engineering-insights`.
- **Not** requirements — those live in `specs/`.
- **Not** the product's review-agent analytics (the app's "Agent Performance" screen).

## File naming
`RETRO-YYYY-MM-DD-<workflow>.md` (e.g. `RETRO-2026-07-01-implement-spec-02.md`). Keep them so the
skill can show a **trend** across runs (tokens / agents / rework over time).

## ledger.md — the accumulating trend
`ledger.md` is a single append-only table with **one row per run**. Each `/review-run` writes its
per-run report *and* appends a row here, so the trend accumulates in one place instead of being
re-derived by diffing two arbitrary retro files. Read the last rows to judge whether agent count,
token spend, and rework are trending up or down. Numbers mirror each retro's Metrics verbatim, with
`unknown` / `~partial` carried through — never back-filled with a guess.

## Durable vs per-run
The per-run report stays here. A learning that recurs across runs (a standing default worth baking
into an agent/brief, a persistent duplication to cache once) is routed to **project memory**, not
duplicated here.

## Git
These are working artifacts. Commit them if you want the cross-run trend in history; otherwise a
team may prefer to gitignore `docs/retros/`.
