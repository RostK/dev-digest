# Retro ledger — cross-run trend

One row per multi-agent workflow run, appended by the `/review-run` skill after it writes each
`RETRO-YYYY-MM-DD-<workflow>.md`. This is the **accumulating** view the per-run reports don't give:
scan it top-to-bottom to see whether agent count, token spend, and rework are trending up or down.

**Maintenance rule (for `/review-run`):** after writing a per-run retro, append ONE row here (create
this file if it's missing). Numbers must match the retro's Metrics section verbatim; carry `unknown`
/ `~partial` through — never invent a figure to fill a cell. Prefer **deep-mode** figures so nested
subagents are counted (a parent's `<usage>` excludes them). Newest row goes at the bottom. Then read
the last few rows to write that retro's "Trend" section.

Legend — Agents `P/W` = productive / wasted(killed·duplicate·retried). Tokens = subagent total, `~`
= partial (some agents — incl. nested subagents — un-measured; deep mode not run). Cache-hit =
cache-read ÷ input. Tool-calls = total across agents. Fix = post-review fix-loop rounds. ∥ =
parallelism factor (agent wall-clock ÷ sum-of-agent-time; `1.0` = single agent). `?` = not captured
by that run's retro (older runs predate cache-hit / tool-call tracking — filled in going forward).

| Date | Workflow | Agents (P/W) | Tokens | Cache-hit | Tool-calls | Fix | ∥ | Notable | Retro |
|------|----------|--------------|--------|-----------|------------|-----|-----|---------|-------|
| 2026-07-02 | plan-implementation (SPEC-02) | 1 / 0 | 148,221 | ? | ? | 0 | 1.0 | single-agent plan phase | [↗](RETRO-2026-07-02-plan-implementation.md) |
| 2026-07-02 | implement (SPEC-02 wave C) | 6 / 1 | ~225,481 | ? | ? | 1+1 | 1.66× | build-phase tokens unknown; 1 rejected code-review launch; spanned 2 sessions (one lost on restart) | [↗](RETRO-2026-07-02-implement.md) |
| 2026-07-02 | implement (SPEC-03 Onboarding) | 7 / 0 | ~721,526 | ? | ? | 0 | 1.66× | T3/T4 session-limit-truncated (tokens uncaptured); review on sonnet | [↗](RETRO-2026-07-02-implement-spec03.md) |
| 2026-07-02 | write-spec + plan (SPEC-04) | 3 / 2 | ~610,555 | ? | ? | n/a | — | ~31% of known tokens wasted (killed planner + duplicate resume) | [↗](RETRO-2026-07-02-plan-spec04.md) |
| 2026-07-03 | implement (SPEC-04 Brief) | 22 / 0 | 2,540,688 | ? | 857 | 1 | — | 5-finder /code-review fan-out was the top token amplifier; 2 post-verify feature iterations later reverted | [↗](RETRO-2026-07-03-implement-spec04.md) |
| 2026-07-04 | ad-hoc (brief fixes — Explore fan-out) | 0 / 3 | unknown | ? | ? | n/a | — | 3 Explore agents launched async then lost to a plan-mode transition (0-byte journals); all exploration redone in main thread | [↗](RETRO-2026-07-04-brief-fixes.md) |
| 2026-07-06 | write-spec (SPEC-05 eval-pipeline) | 5 / 0 | 358,898 | ? | 186 | n/a | 1.43× | first zero-waste, fully-measured run (no nesting → firm total); rework = `verify:l06` clarification reversal caught at spec + edited in-thread | [↗](RETRO-2026-07-06-write-spec-spec05.md) |
| 2026-07-06 | plan-implementation (SPEC-05) | 1 / 0 | 146,191 | ? | 33 | n/a | 1.0 | context pack held planner cost flat (146k vs SPEC-02's 148k) despite a bigger feature; 2 decisions no-reversal; pack's `rangeIntersects` reuse claim was inaccurate (private) → became decision R1 | [↗](RETRO-2026-07-06-plan-spec05.md) |
| 2026-07-09 | verify + pr-self-review gate (SPEC-06) | 3 / 0 | 384,501 | ? | 113 | 0 | 1.37× | first verify/gate-only run; AC-7 runtime bug slipped plan-verifier + all static gates (only the DB-backed it.test caught it); feature source re-read ~2× across the 3 agents (5th shared-pack confirmation) | [↗](RETRO-2026-07-09-verify-pr-gate.md) |
| 2026-07-08 | write-spec (SPEC-07 Export to CI) | 1 / 2 | 123,824 | ? | 23 | 0 | 1.0 | 2 rejected pre-exec launches (global spec-ID + simplicity elicited after launch); in-agent rich→simple rewrite; 0 NCs returned | [↗](RETRO-2026-07-08-write-spec.md) |
| 2026-07-08 | plan-implementation (SPEC-07 Export to CI) | 1 / 0 | 151,325 | ? | 30 | n/a | 1.0 | first zero-waste plan phase: pre-grounded launch prompt + markers-not-AskUserQuestion protocol; 3 open Qs + mode + approval gated in ONE 4-question round; 0 planner re-invocations (answers folded in main thread) | [↗](RETRO-2026-07-08-plan-spec07.md) |
| 2026-07-09 | implement (SPEC-07 Export to CI) | 4 / 2 | 716,787~ | ? | 280 | 0 | 1.57× | 2 killed implementers (isolated agents forked the session checkout, not the sibling feature worktree — no Wave 1); 0 fix subagents (review fixes folded in main thread); 2 reviewers on ONE shared pack kept the amplifier suppressed; T4 UI the 269k outlier | [↗](RETRO-2026-07-09-implement-spec07.md) |

## Reading the trend so far
- **Token spend is climbing with fan-out width**: 148k (1 agent) → ~721k (7) → 2.54M (22). The jump to
  SPEC-04 is dominated by the review fan-out + reverted post-verify iterations, not build.
- **Waste is concentrated in the PLAN phase** (SPEC-04 plan: 2 wasted launches, ~31%), traced to
  killed/duplicate-resumed planners — an orchestration-discipline problem, not a code one.
- **Truncation keeps eating telemetry** (SPEC-02 build, SPEC-03 T3/T4): several rows are `~partial`.
  Splitting large implementer units keeps future rows measurable.
