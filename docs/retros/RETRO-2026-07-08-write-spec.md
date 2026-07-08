# Workflow Retro — write-spec (SPEC-07 Export to CI) · 2026-07-08
Scope: the `/write-spec` authoring pipeline only (INTAKE → DRAFT → REPORT; no plan/implement phase run this session). Source: in-context task notifications · in/out-token split & cache-hit **unknown** (notification carried only aggregate `subagent_tokens`).

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-----------------|-----------|-----------|----------|------|
| 1 | spec-author (SPEC-05, AUTHOR) | DRAFT | opus | **rejected** (pre-exec) | 0 / 0 | — | 0 | ~0s | user interrupt → correct global spec ID to SPEC-07 |
| 2 | spec-author (SPEC-07, AUTHOR) | DRAFT | opus | **rejected** (pre-exec) | 0 / 0 | — | 0 | ~0s | user interrupt → "keep it simple, iterate later" |
| 3 | spec-author (SPEC-07 simplified, AUTHOR) | DRAFT | opus | completed | 123,824 total (split unknown) | unknown | 23 | 424s (~7.1 min) | read 5 design images + briefing; internal rich→simple rewrite |

## Metrics
- Agents: **1 productive / 2 wasted** (both rejected before execution → 0 tokens) · Clarification (RESOLVE) rounds: **0** (agent returned 0 NCs)
- Tokens: **123,824** total (DRAFT 123,824 · RESOLVE 0) · in/out split **unknown** · by tier: all opus (SDD authoring)
- Cache-hit: **unknown** (aggregate-only notification) · Tool-calls: **23**
- Wall-clock ≈ sum-of-agent-time (single agent) → **∥ = 1.0**; agent wall-clock ≈ 424s
- Failures/retries: 2 pre-execution rejected launches (0 tokens each) · Rework traced to: **not code, not spec quality** — (a) gating inputs (global spec ID + scope/complexity) elicited *after* launch; (b) in-agent maximal-then-simplified rewrite
- Nesting: none (`spec-author` spawns no subagents) → token total is complete; only the in/out/cache split is missing

## What went well / hard
- **Win (EASY): 0 clarification rounds.** Front-loading the routing (route / runner-given / GHA-only) and the three simplification decisions (`ci_runs` / pull-Sync / PR+zip) via `AskUserQuestion` *before* the final launch meant the agent returned a clean spec with **0 open NCs** — no RESOLVE pass needed. The write-spec loop collapsed to a single DRAFT.
- **Hard: spec-author #3 was the whole cost** (123.8k tok / 23 tool-uses / 7 min), inflated by two avoidable factors: reading **5 design mockups** (images are token-heavy), and an **internal rich→simple rewrite** (it drafted ~18 ACs / 8 NCs under the detailed brief sections, then rewrote to 20 ACs / 0 NCs after reaching the FINAL SIMPLIFIED SCOPE block at the *bottom* of the brief).

## Duplicated context (redundant grounding)
- Single agent → no cross-agent duplication. Minor: the main thread and the agent both grounded on the same schema/adapters, but the **single shared briefing file** absorbed that grounding and acted as a context pack — a good pattern to keep (and to reuse verbatim as the planner's input). No change needed.

## Missed / rework
- **2 rejected launches** — I launched `spec-author` before (1) confirming the *global* spec ID (assumed SPEC-05 from the local INDEX; real next id = SPEC-07) and (2) eliciting the "smallest v1, iterate later" scope preference. Both surfaced as interrupts, forcing a briefing edit + re-launch each time. 0 agent tokens, but 2 wasted user round-trips + main-thread churn.
- **In-run wasted draft** — brief ordering (authoritative simplified scope at the bottom, under the detailed maximal sections) led the agent to author the maximal version first, then rewrite.

## Recommendations (highest-leverage first)
1. **Front-load ALL gating decisions in the first `AskUserQuestion` batch** — routing **+ global spec-ID confirmation + scope/complexity preference** — before launching any heavy authoring/planning agent. Would have prevented both rejected launches this run. (Recurring: the ledger shows launch-discipline waste in the SPEC-04 plan row too.)
2. **Lead the brief with the authoritative (simplified) scope at the TOP**, with the detailed/rationale sections *below* it — so the agent builds to the final scope directly instead of drafting the maximal version and rewriting. Expected: materially fewer in-run tokens.
3. **Hand design images sparingly** — 5 mockups are token-heavy; describe the stable UI shapes in brief text and pass only the image(s) that resolve a genuine ambiguity.
4. **Reuse the one briefing file as the planner's context pack** — it produced a 0-NC clean return; feed it verbatim into `/plan-implementation` rather than re-deriving.

## Trend (from ledger.md)
- First **solo write-spec** run logged (prior write-spec was bundled with plan: SPEC-04, 3/2, ~610k). This run is cheap by comparison (**1/2, 123.8k**) because a lone `spec-author` has no fan-out.
- **Waste pattern repeats:** as with the SPEC-04 plan row (~31% wasted, killed/duplicate planners), this run's waste is **launch discipline**, not code — consistent with the ledger's standing finding that waste concentrates in the plan/authoring phase. Fix is procedural (front-load gating), not architectural.
- **Cache-hit still uncaptured** (`?` continues) — aggregate-only notifications keep the column blank; unchanged from prior rows.
