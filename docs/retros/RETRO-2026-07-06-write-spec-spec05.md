# Workflow Retro — write-spec (SPEC-05 eval-pipeline) · 2026-07-06
Scope: Phase-1 exploration fan-out (ad-hoc) → write-spec loop (AUTHOR → clarify → RESOLVE) → main-thread spec edit.
Source: in-context task-notifications (`<usage>` blocks). No nesting — Explore/spec-author lack the Agent tool, so
the agent-level token total is complete (**not** `~partial`); only in/out split and cache-read were not reported.

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-----------------|-----------|-----------|----------|------|
| 1 | Explore — backend schema/modules | Explore | inherit | completed | 70,673 (split unknown) | ? | 40 | 127s | parallel group A; found eval_cases/eval_runs + contracts already ship |
| 2 | Explore — frontend UI | Explore | inherit | completed | 60,174 (split unknown) | ? | 53 | 170s | parallel group A; most tool-uses, fewest tokens (efficient reads) |
| 3 | Explore — evals harness + SDD specs | Explore | inherit | completed | 74,584 (split unknown) | ? | 40 | 202s | parallel group A; broadest scope (harness+specs+verify+grounding); token+time outlier |
| 4 | spec-author (AUTHOR) | Draft | unknown | completed | 79,506 (split unknown) | ? | 23 | 212s | drafted SPEC-05, returned 8 NCs |
| 5 | spec-author (RESOLVE) | Resolve | unknown | completed | 73,961 (split unknown) | ? | 30 | 281s | folded 8 NCs → 19 ACs; duration outlier |

## Metrics
- Agents: **5 launched (5 productive · 0 wasted/retried)** · Clarification loops: 1 designed (AUTHOR→ASK→RESOLVE) · Code fix-loop rounds: n/a (spec phase, no build)
- Tokens: **358,898 subagent total** (in/out split unknown; cache-read not reported → cache-hit `?`). By phase: Explore 205,431 · spec-author 153,467.
- Tool-calls: **186** (Explore 133 · spec-author 53)
- Wall-clock ≈ **695s** agent time vs **992s** sum-of-agent-time → **∥ ≈ 1.43×** (gain entirely from the 3 parallel Explores; the two spec-author passes are inherently sequential — RESOLVE depends on AUTHOR + user answers).
- Failures/retries: **none**. Rework traced to: **spec/clarification** (the `verify:l06` reversal), not plan or code.

## What went well / hard
- **Well — parallel Phase-1 exploration.** 3 Explores in one message returned the full backend + frontend + evals/SDD ground map in ~202s wall-clock instead of ~499s sequential; every downstream decision was grounded in real `file:line` facts (schema already ships, contracts already exist, `grounding.ts` is the reusable scorer).
- **Well — zero waste, fully measurable.** First ledger run with a firm (non-`~partial`) token total and 0 wasted launches since tracking began — contrast the prior 2026-07-04 ad-hoc fan-out (0/3, all lost).
- **Hard — spec-author RESOLVE (281s).** Folding 8 NCs across ~7 ACs + a scoring appendix was the heaviest single unit; unavoidable given the decision density.
- **Hard — Explore-evals (74.6k / 202s).** Broadest brief (harness + specs convention + verify scripts + grounding + existing tables); a candidate to split, though its findings were all load-bearing.

## Duplicated context (redundant grounding)
- The **eval-domain core files were re-read by ~4 agents**: `server/src/db/schema/eval.ts`, `contracts/knowledge.ts` + `eval-ci.ts`, `reviewer-core/src/grounding.ts`, the module pattern, `server/package.json` verify scripts. Both **Explore-backend and Explore-evals** independently covered the `eval_cases`/`eval_runs` schema + shared contracts (a brief-scoping overlap I created). Then **spec-author (both passes) re-grounded on the same files** despite receiving a detailed text brief — read-only agents re-verify by reading. Matches the standing note [[parallel-gate-agents-share-context-pack]].

## Missed / rework
- **`verify:l06` churn (3 clarification rounds + 1 re-edit).** I asked → "resolved" as a deterministic server test → the user **reversed** after reading the spec → 2 more AskUserQuestion rounds → final "real recorded fixtures" → a direct main-thread spec edit. Root cause: I treated `verify:lNN` semantics as something to **derive/recommend**, when it is **course-grader knowledge only the user has**, and I re-argued past the user's repeated `evals/` instinct twice. Cost was cheap in tokens (edited the spec directly — **no spec-author relaunch**, saving ~74k) but expensive in round-trips.

## Recommendations (highest-leverage first)
1. **Inject ONE shared eval-domain context pack into the next phases.** For `/plan-implementation` and `/implement` on SPEC-05, hand plan-verifier / architecture-reviewer / implementers a single grounded `file:line` map (schema/eval.ts · knowledge.ts + eval-ci.ts · grounding.ts scoring · module pattern · verify:l03) instead of each re-running git diff + re-reading. Reinforces [[parallel-gate-agents-share-context-pack]].
2. **Ask course-grader conventions up front.** When a course/homework task names a command or threshold (`verify:lNN`, a submission gate, "≥8 cases"), make it a **first-class clarification asked before recommending** any technically-correct alternative — the user owns that knowledge. Would have collapsed the 3-round `verify:l06` reversal into one question.
3. **Keep folding late/mechanical spec answers via direct main-thread edits.** The `verify:l06` reversal cost ~0 extra agent tokens this way vs ~74k for a spec-author relaunch. Confirms [[plan-phase-fold-mechanical-answers]].
4. **Sharpen Explore brief boundaries.** Backend-schema and evals-infra overlapped on the eval tables/contracts; a cleaner split (or 2 agents) would trim the redundant grounding — low value, since the parallel win outweighed it.

## Trend (from ledger.md)
- **Waste dropped to zero.** Prior two runs carried heavy waste (2026-07-04 ad-hoc 0/3 all lost; SPEC-04 plan 3/2 ~31%); this run is **5/0** and fully measured (no `~partial`).
- **Token spend is modest and expected for a spec phase**: 359k vs the build/review fan-outs (721k–2.54M). No review fan-out here — the L06 amplifier risk (5-finder /code-review) lands later, at `/implement`.
- **Parallelism 1.43×** sits just under the ~1.66× of prior implement rows — lower only because just Phase-1 parallelized; the sequential AUTHOR→RESOLVE dependency caps it.
- **Rework moved earlier and cheaper**: this run's rework was a clarification-loop reversal caught at the spec (edited in-thread), not a post-verify code revert like SPEC-04's.
