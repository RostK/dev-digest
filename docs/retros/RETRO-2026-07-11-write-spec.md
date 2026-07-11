# Workflow Retro — write-spec (SPEC-09 Agent Performance + SPEC-10 Plugin Export/Import) · 2026-07-11
Scope: `/write-spec` loop — DRAFT (author) + RESOLVE phases, dual-spec parallel fan-out · Source: in-context task-notifications (firm total — no nesting; spec-author spawns no subagents)

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-----------------|-----------|-----------|----------|------|
| 1 | Draft Plugin Export/Import spec | DRAFT (author) | default (inherited) | completed | 89,154 (split unknown) | unknown | 31 | 333.2s | heaviest agent; also absorbed the INDEX SPEC-09→SPEC-10 renumber race |
| 2 | Draft Agent Performance spec | DRAFT (author) | default (inherited) | completed | 87,072 (split unknown) | unknown | 29 | 269.7s | grounded on L07 Stats / L08 AgentPerf stub |
| 3 | Resolve Plugin spec NCs | RESOLVE | default (inherited) | completed | 59,018 (split unknown) | unknown | 38 | 319.0s | 8 NCs folded across many sections → most tool-uses of the run |
| 4 | Resolve Agent Performance spec NCs | RESOLVE | default (inherited) | completed | 39,785 (split unknown) | unknown | 19 | 183.2s | cheapest + fastest; 6 NCs into an existing draft |

Launched in two parallel pairs: agents 1&2 together (DRAFT), then — after one batched clarification round with the user — agents 3&4 together (RESOLVE).

## Metrics
- Agents: **4 launched (4 productive · 0 wasted/retried)** · Clarification rounds: **1** (14 NCs → 1 ASK → 1 RESOLVE pass; no re-loop) · Fix-loop rounds: n/a (write-spec)
- Tokens: **275,029 subagent total** (in/out split unknown — notifications carried aggregate `subagent_tokens` only). By phase: DRAFT 176,226 (64%) · RESOLVE 98,803 (36%). By model tier: all on the inherited default. **Cache-hit: unknown** (no cache-read field in notifications).
- Tool-calls: **117** (DRAFT 60 · RESOLVE 57)
- Wall-clock ≈ **652.2s** agent-time (max of each parallel pair: 333.2 + 319.0) vs **sum-of-agent-time 1,105.1s** → **parallelism ≈ 1.69×** (near-ideal 2.0× for two pairs; the pairing saved ~7.5 min of wall-clock)
- Failures/retries: **none** · Rework traced to: **none** (single-pass resolve; the INDEX race was self-corrected inside agent 1, not rework)

## What went well / hard
- **Hard — the two AUTHOR agents (89k/87k tok, 31/29 tools, ~4.5–5.5 min).** Grounding a fresh spec from zero (repo conventions, schema, existing modules, the requirements rubric) is the real cost. Plugin AUTHOR was the outlier on both tokens and duration, partly because it also detected and resolved the INDEX SPEC-09/SPEC-10 collision.
- **Hard-ish — Plugin RESOLVE used 38 tool-uses** (more than either AUTHOR) despite far fewer tokens: 8 NCs each touching several spec sections = many small edits.
- **Easy — Agent Performance RESOLVE (39.8k tok, 19 tools, 183s):** folding 6 answers into an existing draft is ~2.2× cheaper than authoring it. Clean, no friction.

## Duplicated context (redundant grounding)
- Both AUTHOR agents independently re-read the same scaffolding: `CLAUDE.md`, `specs/TEMPLATE.md`, `specs/INDEX.md`, `specs/README.md`, the contracts barrel, and the `requirements-engineering` rubric. That shared grounding was paid ~2× across the 176k DRAFT phase.
- Both RESOLVE agents re-opened their spec + TEMPLATE again on top of what the AUTHOR pass already loaded.

## Missed / rework
- **INDEX.md concurrent-write race:** both AUTHOR agents claimed **SPEC-09** simultaneously; the Plugin agent detected the collision on write, **renumbered itself to SPEC-10 and cross-linked** the two. Correct outcome, zero wasted agent — but a latent hazard of fanning parallel authors into one shared registry file. This is the run's single real orchestration defect.
- **14 NCs closed in one batched round** (8 asked via a 2-modal `AskUserQuestion`, 6 applied as flagged defaults) → **one** RESOLVE pass, no second loop. Efficient; nothing surfaced late or out of scope.
- No duplicate/failed/killed launches; no re-dispatch.

## Recommendations (highest-leverage first)
1. **Pre-assign Spec IDs in the brief when fanning out ≥2 AUTHOR agents.** Tell each "you are SPEC-09" / "you are SPEC-10" up front so they never both claim the same INDEX row. Eliminates the only hazard this run hit, at zero cost.
2. **Inject a shared repo-grounding pack once** (CLAUDE.md digest + TEMPLATE + INDEX snapshot + contract/convention pointers) into both AUTHOR briefs, instead of each agent re-discovering it. The `plan-implementation` runs already show a context pack holding cost flat (SPEC-05 ledger note) — same lever applies to parallel spec-authoring; targets the ~176k DRAFT phase.
3. **Drop RESOLVE passes to a cheaper model tier.** AUTHOR is hard grounding+reasoning; RESOLVE is mechanical answer-folding (agent 4 already ran clean at 39.8k). A cheaper tier on RESOLVE cuts cost with low quality risk.
4. **Close the telemetry gap.** Notifications gave only aggregate `subagent_tokens` — no in/out or cache-read — so **cache-hit % (the L08 cost signal) is unmeasurable from context**. Run deep-mode against the task journals when cache-hit matters.
5. **Keep the batched-clarification + parallel-RESOLVE discipline.** 14 NCs → 1 round → 1 pass, and a 1.69× parallel pairing, is the efficient path — carry it forward for multi-spec loops.

## Trend (from ledger.md)
- **Per-spec token cost is low.** 275k for **two** specs ≈ **137k/spec**, below the single-spec write-spec baselines (SPEC-05 358,898 for one spec; SPEC-08 write+plan 243,320). Parallel dual-authoring is efficient per unit of output.
- **Zero-waste streak continues.** 4/0 here extends the recent clean runs (SPEC-05 5/0, SPEC-08 write+plan 3/0, SPEC-08 implement 4/0). The waste that plagued earlier runs (SPEC-04 ~31%, SPEC-07 implement 2 killed) stays absent — launch discipline is holding.
- **Cache-hit still uncaptured** (`?` down the whole ledger column) — this run can't break that streak without deep mode. The one *new* trend signal is a fan-out hazard the ledger hasn't logged before: **concurrent writes to a shared registry file** (INDEX.md), addressed by recommendation #1.
