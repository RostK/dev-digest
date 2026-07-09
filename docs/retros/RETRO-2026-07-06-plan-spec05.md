# Workflow Retro — plan-implementation (SPEC-05 eval-pipeline) · 2026-07-06
Scope: PLAN phase — `implementation-planner` run + main-thread orchestration (context-pack injection, 2 decision
relays, plan persist). Source: in-context task-notification `<usage>`. No nesting (planner has no Agent tool; 0
research fan-outs) → the token total is firm, not `~partial`; only in/out split and cache-read were not reported.

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-----------------|-----------|-----------|----------|------|
| 1 | implementation-planner (SPEC-05) | Plan | opus | completed | 146,191 (split unknown) | ? | 33 | 308s | grounded on the context pack; produced 10 units + wave graph; surfaced 2 decisions (exec-mode, R1); flagged 0 research gaps |

## Metrics
- Agents: **1 launched (1 productive · 0 wasted)** · Decisions relayed: 2 (exec-mode, R1 — designed, resolved in one AskUserQuestion round each, **no reversal**) · Fix-loop rounds: n/a
- Tokens: **146,191 subagent total** (firm — no nesting; in/out split + cache-read not reported → cache-hit `?`). Single opus-tier agent.
- Tool-calls: **33**
- Wall-clock ≈ **308s** vs sum-of-agent-time 308s → **∥ 1.0** (planning is inherently single-agent)
- Failures/retries: **none**. Rework: **none** — both decisions were clean forward choices (contrast the write-spec phase's 3-round `verify:l06` churn).

## What went well / hard
- **Well — the context pack paid off (validates prior retro rec #1).** The planner held tokens ~flat at **146k vs the SPEC-02 plan baseline of 148,221** *despite SPEC-05 being a much larger feature* (10 units / 19 ACs vs SPEC-02's smaller scope). At **33 tool-uses** it did targeted verification reads, not a full re-exploration — last phase's Explore agents were 40–53 tool-uses each. Holding cost flat while scope grew is the pack absorbing the extra ground.
- **Well — clean decision surfacing.** The planner returned exactly 2 decisions + "0 research gaps" + "no blocking questions"; both resolved in a single AskUserQuestion round with no reversal. Requirements review traced every AC to a unit up front.
- **Hard — none.** The 308s duration is the session's longest single agent, but that's depth for a 10-unit plan (grounding + wave graph + INSIGHTS quotes + test plan), not a struggle.

## Duplicated context (redundant grounding)
- Mild and **intended**: the planner re-opened a few files the last phase's Explores already covered (`schema/eval.ts`, `grounding.ts`, `container.ts`, agents module) to *verify* load-bearing details — it said so explicitly ("open files only to verify a load-bearing detail"). The pack kept this to 33 reads. Candidate refinement: embed the 2–3 exact signatures it still had to open files for (`rangeIntersects` visibility, `reviewPullRequest` return shape, `MockLLMProvider`) directly in the pack.

## Missed / rework
- **Context-pack accuracy gap (caught by the planner).** The pack listed `rangeIntersects` as a reusable `grounding.ts` helper without checking its **export status** — it is module-private. The planner discovered this and escalated it to **decision R1** (export it vs local fallback). No wasted tokens (it surfaced cleanly), but a more accurate pack would have pre-answered R1. This is the only "miss" and it's a pack-authoring lesson, not a planner failure.

## Recommendations (highest-leverage first)
1. **Carry the SAME context pack into `/implement`.** The pack demonstrably held the plan phase's cost flat; the payoff is far larger across a 10-worker build than a single planner. This is the write-spec retro's rec #1, now validated at the plan phase — extend it to the build fleet so 10 implementers don't each re-read the eval domain. Expected saving: the bulk of per-implementer re-grounding.
2. **Verify a context pack's "reuse" claims before shipping it.** When a pack tells downstream agents to reuse a helper, confirm its export status / signature — the `rangeIntersects` visibility gap became a decision the planner had to raise. Cheap to check at pack-authoring time. Routed to memory.
3. **Keep the plan phase on opus (deliberate, not waste).** 146k opus tokens for a plan is defensible: plan errors cascade to 10 implementers, so the design judgment is high-leverage. Flag it as a chosen tier, not something to downgrade.

## Trend (from ledger.md)
- **Plan-phase cost is stable**: 146,191 (SPEC-05) ≈ 148,221 (SPEC-02) on tokens — but SPEC-05 is the bigger feature, so flat tokens = the pack absorbing scope.
- **Zero waste, second run running** — write-spec phase (5/0) then this plan phase (1/0). Contrast the SPEC-04 plan (3/2, ~31% wasted from killed/duplicate planners); launch discipline is holding.
- **∥ 1.0** as expected for a single-agent plan; the parallelism payoff arrives at `/implement` (wave 3 = 5 disjoint workers).
