# Workflow Retro — ad-hoc (SPEC-04 brief fixes + retro tooling) · 2026-07-04
Scope: a single 3-agent `Explore` fan-out at session start; ALL other work (exploration,
implementation, verification of the 5 brief/tooling changes + the sticky-header scroll fix) ran in
the **main thread** with no subagents. Source: in-context orchestration facts + deep-mode attempt on
the three task journals (all 0-byte → per-agent telemetry unrecoverable).

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-----------------|-----------|-----------|----------|------|
| 1 | Explore — brief caching + layout | Explore | unknown | LOST | unknown | unknown | unknown | unknown | launched async, then abandoned; journal 0-byte |
| 2 | Explore — sidebar nav sections | Explore | unknown | LOST | unknown | unknown | unknown | unknown | same batch; journal 0-byte |
| 3 | Explore — retro skill + ledger | Explore | unknown | LOST | unknown | unknown | unknown | unknown | same batch; journal 0-byte |

All three launched in ONE parallel message, then the next turn re-entered plan mode / re-sent the
prompt; no completion notifications ever arrived and the `tasks/<id>.output` journals are empty.

## Metrics
- Agents: 3 launched (0 productive · 3 wasted/lost) · Fix-loop rounds: n/a (main-thread work)
- Tokens: unknown (0-byte journals — no usage captured) · Cache-hit: unknown · Tool-calls: unknown
- Wall-clock vs sum-of-agent-time: n/a (none completed)
- Failures: 3 — all lost to a plan-mode transition immediately after an async launch. Rework traced
  to: **orchestration** (fan-out redone by hand), not spec / plan / code.

## What went well / hard
- Hard: the Explore fan-out — launched `run_in_background` right before the turn flipped into plan
  mode; all three dropped with zero recoverable telemetry. The manual 0-byte check confirmed the loss.
- Easy: main-thread execution — direct Grep/Read grounding + Edit across ~18 files, typecheck + the
  affected Vitest suites, and a live browser eyeball landed cleanly with **no** further agents. A
  bounded, known-module change didn't need a fan-out at all.

## Duplicated context (redundant grounding)
- The three agents' entire intended grounding (brief module server+client, sidebar `nav.ts`, the
  `review-run` skill/ledger) was re-read from scratch in the main thread → effectively 100% of the
  lost fan-out's work was duplicated inline.

## Missed / rework
- The whole fan-out was wasted; exploration was redone by hand. No user-facing miss resulted — the
  main-thread pass covered everything the agents were meant to.

## Recommendations (highest-leverage first)
1. **Don't launch background/async agents right before a plan-mode or approval gate** — the transition
   drops them (0-byte journals here, no notifications). Launch after exiting plan mode, or run
   exploration inline. Reinforces `background-agents-lost-on-restart`.
2. **Skip the Explore fan-out for bounded, known-module changes.** This task touched a knowable set
   (brief module, `nav.ts`, diff-viewer, retro skill); main-thread Grep/Read was faster and lossless.
   Fan-out earns its token cost only when scope is genuinely broad/uncertain.
3. **Verify disk/notifications before redoing a background agent's work** — the explicit 0-byte check
   here would have confirmed the loss instantly (I assumed it, correctly, but make the check a step).

## Trend (from ledger.md)
Prior ledger rows are all true `/plan` or `/implement` pipelines (1–22 agents · 148k–2.54M tokens).
This session is the first **all-wasted fan-out** row: 3 launched, 0 productive, telemetry
unrecoverable. The signal isn't a cost blow-up (main-thread work dominated and succeeded) — it's a
launch-discipline miss: an async fan-out fired into a plan-mode gate. Net orchestration lesson: for
work this bounded, the fan-out was pure overhead.
