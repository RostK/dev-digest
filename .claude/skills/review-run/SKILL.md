---
name: review-run
description: "Post-run retrospective for a MULTI-AGENT workflow (the SDD /implement pipeline, or any fan-out of subagents). Reconstructs the run's telemetry (agents launched, launch order, per-agent tokens / tool-uses / duration, failures & retries, parallelism), synthesizes qualitative insights (which agents were hard vs easy, what context was duplicated across agents, what information was missed or re-worked), emits a retro report to docs/retros/, and routes durable cross-run orchestration learnings to project memory. It evaluates the ORCHESTRATION — not the code (that is engineering-insights → INSIGHTS.md), not the requirements (that is the spec), and not the product's review agents (that is the app's Agent Performance screen)."
when_to_use: "Trigger phrases: '/review-run', 'workflow retro', 'how did that run go', 'evaluate the agent run', 'retro the pipeline', 'review the workflow performance'. Run AFTER a multi-agent workflow finishes (e.g. at the end of /implement). User-invoked. For durable CODE learnings use engineering-insights; for a per-run orchestration retro use this."
version: 0.1.0
---

# review-run

You produce a **retrospective on a multi-agent workflow run** — how the orchestration itself went,
not whether the code is correct. You answer: how many agents ran and in what order, what each cost
(tokens / tool-uses / wall-clock), what failed or was redone, which agents struggled, what context
was wastefully duplicated, what was missed — and what to change next time.

**Boundary — three capture systems, keep them distinct:**
- **`engineering-insights`** → durable **code** learnings → a module's `INSIGHTS.md`.
- **`review-run`** (this) → how a multi-agent **run** went → a report in `docs/retros/`, plus
  durable **orchestration** patterns to project memory.
- The DevDigest app's **Agent Performance** screen → the *product's* review agents (unrelated).

## Data sources — reconstruct, never fabricate
Your primary source is **this session's own record of the run** — you (the main thread) launched the
agents and received their completion notifications, each carrying a `<usage>` block
(`subagent_tokens` incl. `cache_read`, `tool_uses`, `duration_ms`) and a status (`completed` /
`failed` / `killed`). Read those from the conversation you just conducted:
1. **Per-agent telemetry** — from each task-notification's `<usage>` + status: input / output /
   cache-read tokens, tool-uses, duration.
2. **Orchestration facts** — launch order, phase, parallel group, model, retries/re-launches, and
   blockers/hand-offs — which you know because you drove them.
3. **Deep mode (disk journals)** — the ACCURATE path for nested runs (and when notifications have
   scrolled out of context): a small script parses the per-task transcript files
   (`…/tasks/<id>.output`, JSONL) for the trailing usage record ONLY — extract aggregate fields
   (tokens incl. cache-read · tool-uses · duration · status) and **never emit transcript bodies into
   context** (they overflow it).

**Nested subagents undercount in-context.** A parent's `<usage>` counts only the tokens IT spent —
NOT the tokens of subagents IT spawned (e.g. `researcher`s nested inside `implementation-planner`, or
any agent that fans out further). Our SDD pipeline nests, so the in-context sum is a **floor**, not a
total. For a true nested total run **deep mode** and sum the nested agents' own journals too; mark the
in-context figure `~partial` whenever nesting occurred and deep mode wasn't run.

**Honesty rule:** if telemetry is partial (context was summarized, a script couldn't run, nesting
went unmeasured), say so and mark the number `unknown` / `~partial` — never invent a token or agent
count. A retro with three real rows and two "unknown" rows is worth more than five guessed ones.

## Procedure

```
- [ ] 1. SCOPE — name the run: which workflow (/implement, /sdd-run, ad-hoc fan-out), which phases it
         covered, and the rough time window. If several runs are in scope, retro the most recent unless told otherwise.
- [ ] 2. COLLECT — build one row per agent launch: order · label · phase · model · status · tokens ·
         tool-uses · duration · retry/blocker note. Include FAILED/KILLED/duplicate launches (they cost tokens too).
- [ ] 3. METRICS — derive: total agents (and wasted/retried), total subagent tokens (in/out/cache-read;
         by phase / by model tier), **cache-hit %** (cache-read ÷ input — the L08 cost-engineering signal),
         total tool-calls, wall-clock vs sum-of-agent-time (parallelism efficiency), fix-loop rounds
         (rework), failure/retry count. Include nested-subagent tokens (deep mode) or mark `~partial`.
- [ ] 4. QUALITATIVE — for each agent/phase judge: HARD vs EASY (token/tool-use/duration outliers + blockers);
         DUPLICATED context (same files/briefs/skills read by ≥2 agents — redundant grounding); MISSED info
         (out-of-scope needs surfaced late, clarifications/NCs raised, re-dispatches); WASTED parallelism
         (fast agents idling on a barrier for a slow sibling; a duplicate launch doing the same work).
- [ ] 5. RECOMMEND — concrete, grounded changes: bake recurring clarifications as standing defaults in the
         agent/brief; inject a shared context pack ONCE instead of N agents re-reading it; re-batch parallel
         groups; split/merge task units; adjust a model tier; tighten launch discipline (dedup, verify-disk-before-relaunch).
- [ ] 6. WRITE + ROUTE — save the report to `docs/retros/RETRO-YYYY-MM-DD-<workflow>.md`; then append ONE
         row to `docs/retros/ledger.md` (the accumulating cross-run trend table — create it from the header
         in that file if it is somehow missing), numbers matching this retro's Metrics verbatim (carry
         `unknown`/`~partial` through, never invent a figure); READ the ledger's last few rows to write this
         retro's Trend section (the ledger, not a single prior file, is the source of the trend); finally route
         ONLY durable, recurring orchestration learnings to project memory (link related notes, don't duplicate
         what the repo/git already records).
- [ ] 7. REPORT — show the run table, the top findings, and the 3–5 highest-leverage recommendations.
```

## Output format — the retro report

```
# Workflow Retro — <workflow> · <date>
Scope: <phases covered> · Source: <in-context notifications | deep-mode disk journals | ~partial>

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-----------------|-----------|-----------|----------|------|
(one row per launch, including failed/killed/duplicate; "unknown" where telemetry is missing,
"~partial" where nested-subagent tokens weren't measured via deep mode)

## Metrics
- Agents: N launched (M productive · K wasted/retried) · Fix-loop rounds: R
- Tokens: total in/out (by phase; by model tier) · Cache-hit: X% · Tool-calls: N
- Wall-clock ≈ vs sum-of-agent-time (parallelism factor)
- Failures/retries: <list with cause> · Rework traced to: spec | plan | code

## What went well / hard
- Hard: <agent/phase — why (outlier tokens/tool-uses, blocker)>
- Easy: <agent/phase — clean, low cost>

## Duplicated context (redundant grounding)
- <files/briefs/skills read by ≥2 agents> → candidate to inject once

## Missed / rework
- <out-of-scope needs, late clarifications, re-dispatches, duplicate launches>

## Recommendations (highest-leverage first)
1. <concrete edit to an agent / skill / brief / launch discipline> — expected saving
...

## Trend (from ledger.md, if prior rows exist)
- Agents / tokens / rework: <up|down vs the last few ledger rows>
```

After writing the report, append its summary row to `docs/retros/ledger.md` so the trend accumulates
across runs (see that file's maintenance rule).

## Boundaries
1. **Orchestration only.** No code-quality, requirements, or product-agent judgments.
2. **Reconstruct, don't fabricate** — unknown telemetry stays `unknown`.
3. **Route, don't dump** — the per-run report lives in `docs/retros/`; only durable, *recurring*
   patterns go to project memory (a one-off run detail is not memory-worthy).
4. **Cheap by design** — you run in the main thread from data you already have; do NOT fan out new
   agents to "measure" the run, and never load full transcripts into context.

## Language
Converse in the language of the request; keep agent/skill names, paths, and metric keywords verbatim.
