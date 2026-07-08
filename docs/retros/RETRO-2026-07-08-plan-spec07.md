# Workflow Retro — plan-implementation (SPEC-07 Export to CI) · 2026-07-08

Scope: PLAN phase only (`/plan-implementation` for `specs/cross/SPEC-07-2026-07-08-export-to-ci.md`),
single wave, ~10-minute window. Source: in-context task notification (deep mode attempted — the task
journal file was empty, 0 lines — so cache-read breakdown is unknown; the notification total is
authoritative since `implementation-planner` has no Agent tool and cannot nest subagents).

Session context around the run (main-thread, not agent launches): workspace confirmation, SPEC-07
restore + approval, given-runner verification (install/typecheck/build), plan persist + 4-question
gate. None of that spawned agents.

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (total) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|----------------|-----------|-----------|----------|------|
| 1 | implementation-planner ("Plan SPEC-07 Export to CI") | PLAN | opus (per agent def) | completed | 151,325 | unknown | 30 | 9m 58s | 0 retries, 0 rejected launches, 0 re-invocations; returned full plan + 3 open Qs as text markers |

## Metrics
- Agents: 1 launched (1 productive · 0 wasted/retried) · Fix-loop rounds: n/a (plan phase)
- Tokens: 151,325 subagent total (in/out split unknown — journal empty) · Cache-hit: unknown · Tool-calls: 30
- Wall-clock ≈ 10 min ≈ sum-of-agent-time → parallelism factor 1.0 (single agent by design)
- Failures/retries: none · Rework traced to: none (0 planner re-invocations; 3 mechanical answers folded by the main thread at persist time)

## What went well / hard
- **Easy — the whole run.** One launch, completed clean, well-grounded output (it independently
  verified: no `yaml` dep in server, skills have no `slug` column, `MockGitHubClient implements
  GitHubClient` forces a mock edit, AgentEditor tab labels live under the `agents` i18n ns). All
  three open questions came back with defaults pre-baked into the plan text, so folding the user's
  answers required zero structural edits.
- **Hard — nothing.** No outliers: 30 tool-uses / ~10 min / ~151k tokens is in line with the
  SPEC-02 single-planner baseline (148,221).

## Duplicated context (redundant grounding)
- The main thread and the planner both read the SPEC-07 briefing, the spec, and
  `server/src/vendor/shared/contracts/eval-ci.ts`. At 1 agent this is the intended shape — the
  briefing IS the shared context pack (injected once via the launch prompt, per the standing
  context-pack rule) and the planner's re-verification of pre-grounded facts (e.g. re-listing
  `agent-runner/dist/` on disk) is cheap, useful confirmation rather than waste.

## Missed / rework
- None material. Cosmetic only: the planner's summary blurb called the stale client `eval-ci.ts`
  "144-line" while its own plan body (and the main thread's measurement) said 246 — corrected at
  persist time, no downstream effect.
- Deep-mode gap: the task journal (`tasks/<id>.output`) was empty at retro time, so cache-hit and
  the in/out token split were unrecoverable. Not worth process change at n=1; note and watch.

## Recommendations (highest-leverage first)
1. **Codify this run's planner launch template as the standing pattern** — it produced the first
   zero-waste plan phase: (a) authoritative context pack by absolute path, (b) session-verified
   volatile facts pre-grounded in the prompt (runner `dist/` = 3 files; stale client vendor copy)
   which eliminated any research fan-out, (c) hard constraints inline, (d) the explicit "do NOT
   AskUserQuestion — return OPEN QUESTIONS / EXECUTION MODE as text sections" protocol. Expected
   saving vs SPEC-04-style plan phase: ~2 wasted launches / ~190k tokens.
2. **Keep the single 4-question gate** (3 open Qs + execution mode + plan approval in ONE
   AskUserQuestion round). This run resolved everything in one round with zero re-litigation —
   confirms the front-load-gating rule for the plan gate specifically.
3. **Fold, don't re-invoke** (re-confirmed): all 3 planner clarifications were mechanical; folding
   them into the persisted plan in the main thread cost ~0 vs a ~150k-token RESOLVE re-invocation.

## Trend (from ledger.md)
- **Plan-phase waste eliminated**: SPEC-04's plan phase wasted 2 launches (~31% of known tokens);
  SPEC-07's write-spec still had 2 rejected pre-exec launches; this plan phase had **0** — the
  batched pre-launch gating + marker protocol appear to have closed the known waste concentration.
- **Token cost back to baseline**: 151,325 ≈ the SPEC-02 single-planner plan phase (148,221),
  versus ~610k for the SPEC-04 combined write-spec+plan.
- **Tool-calls now captured** (30) — continues the write-spec row's precedent (23); cache-hit
  remains `?` across all rows to date.
