# Workflow Retro — write-spec + plan-implementation (SPEC-08 Idempotent Export to CI) · 2026-07-10
Scope: SDD WHAT+HOW phases — `/write-spec` (spec-author ×2) then `/plan-implementation` (implementation-planner ×1). Build phase (`/implement`) NOT run (user approved plan-only). · Source: in-context task-notification `<usage>` blocks. No nesting occurred (planner returned "Research needed: none" → spawned 0 researchers), so the token total is **firm, not ~partial**.

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (subagent) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-------------------|-----------|-----------|----------|------|
| 1 | spec-author (AUTHOR) | write-spec | opus | completed | 78,346 | ? | 13 | ~234s | Drafted SPEC-08 from template; grounded on service.ts/octokit.ts/adapters.ts/manifest.ts; returned 3 NCs |
| 2 | spec-author (RESOLVE) | write-spec | opus | completed | 51,863 | ? | 20 | ~219s | Folded 3 NC answers in one pass; removed markers; flagged NC-1/NC-2 coupling correctly |
| 3 | implementation-planner | plan | opus | completed | 113,111 | ? | 21 | ~283s | File-level plan; verified `commitFiles` single-caller + `CommitFilesPayload` server-only; 0 nested researchers |

Cache-hit `?`: the notifications carry only an aggregate `subagent_tokens` (no input/output/cache-read breakdown) — same limitation as every prior ledger row.

## Metrics
- **Agents: 3 launched (3 productive · 0 wasted/retried)** · Fix-loop rounds: 0 (implement not reached)
- **Tokens: 243,320 total** (firm — no nesting). By phase: write-spec 130,209 (2 passes) · plan 113,111. Model tier: 100% opus.
- **Cache-hit: unknown** (aggregate-only usage) · **Tool-calls: 54** (13+20+21)
- **Wall-clock vs sum-of-agent-time:** agents ran strictly sequential (each awaited + a user gate between) → sum-of-agent-time ≈ 736s (~12.3 min); wall-clock longer (interleaved AskUserQuestion rounds). **Parallelism factor 1.0** — inherent to gated SDD phases; nothing parallelizable here.
- **Failures/retries: none.** No killed/duplicate launches, no planner re-invocation (3 NC answers folded via ONE RESOLVE pass; the approval status-bump + INDEX edit done in main thread, not an agent).
- **Rework traced to:** none in the agent graph. One late *gate* round (below) traces to **the brief**, not to spec/plan/code.

## What went well / hard
- **Hard: implementation-planner** — the token/tool/duration outlier (113k · 21 tool-uses · 283s). Justified: it independently grounded (grep'd `commitFiles` callers, verified the client vendor copy has **no** `CommitFilesPayload`, read INSIGHTS pitfalls) and returned a plan that *shrank* scope (unconditional reset, no contract change, `service.ts` untouched). High value, not waste.
- **Easy: spec-author RESOLVE** — cheapest agent (52k), a clean 3-answer fold; correctly caught that NC-1 (reset-to-base) mechanically subsumes NC-2 (stale skills) and surfaced the coupling instead of blindly applying contradictory answers.
- **Zero wasted launches** — continues the SPEC-07-plan trend (front-loaded gating → no rejected pre-exec launches). The spec-ID (SPEC-08, global) and scope bar were fixed in the launch brief, so neither spec-author pass was re-launched.

## Duplicated context (redundant grounding)
- **The same 4 files were ground-read across both phases**: `server/src/modules/ci/service.ts`, `server/src/adapters/github/octokit.ts` (`commitFiles`), `server/src/vendor/shared/adapters.ts`, `agent-runner/src/manifest.ts`. spec-author (AUTHOR) read them, then implementation-planner re-read/re-verified all of them (contributing to its 21 tool-uses). My planner brief already carried the grounded citations (`octokit.ts:288-300`, `service.ts:83`, etc.), but the planner re-verified from source rather than trusting them — appropriate for a read-only planner, yet a candidate for a **shared context pack** (grounded excerpts passed once) to trim re-grounding, as done for SPEC-05/07.

## Missed / rework
- **Foundational product-model question surfaced LATE (the one real finding).** The whole spec was drafted and NC-resolved on the premise "**v1 = one active agent per repo (overwrite)**" — but that premise came from **my brief asserting it**, not from a user decision. The user only challenged it at the *plan-gate* ("should one export overwrite previous? can different agents live side by side?"), forcing an extra clarification round (a full overwrite-vs-multi-agent comparison) **after** the spec was already approved-in-waiting. No agent was wasted, but a foundational WHAT was re-litigated at the last gate instead of the first. The spec-author never raised it as an NC because the brief pre-baked it as a given.
- **Spec imperfection caught downstream (minor).** The spec's dual-vendor caution ("if a flag is threaded through `CommitFilesPayload` it is dual-vendored to the client copy") was **wrong** — the planner verified `CommitFilesPayload` is server-only (client has no `commitFiles` at all). The plan corrected it into decision OQ-1. Mirrors SPEC-05's "pack's `rangeIntersects` reuse claim was inaccurate → became decision R1": grounding imperfections in the WHAT keep getting caught in the HOW, which is the pipeline working — but earlier verification in spec-author would be cheaper.

## Recommendations (highest-leverage first)
1. **Surface foundational *product-model* assumptions as an up-front user question — don't bake them in the brief.** Process-gating (spec-ID, scope bar) is already front-loaded well; the gap is **domain-model** assumptions (here: one-vs-many agents per repo). When the brief asserts a load-bearing model decision the user hasn't explicitly made, tell spec-author to raise it as **NC-0** (or ask it in the first gating batch), so it's settled before drafting — not re-litigated at the approval gate. Extends `front-load-gating-before-launch` from process to product. *Saving: one late spec/plan-gate re-litigation round.*
2. **Pass the spec's grounded citations to the planner as a shared context pack.** The 4 CI-export files were read in both phases; injecting the spec-author's grounded excerpts (with `path:line`) into the planner brief would trim some of its 21 tool-uses of re-grounding. (Consistent with `parallel-gate-agents-share-context-pack`, applied sequentially spec→plan.) *Saving: a few planner tool-uses / grounding tokens.*
3. **Have spec-author verify a dual-vendor claim before asserting it.** A one-line grep for the type in `client/src/vendor/shared/` before writing "this is dual-vendored" would have avoided the inaccurate caution the planner had to correct. *Saving: a downstream correction.*
4. **Keep folding mechanical NC/clarification answers in the main thread** — done correctly this run (3 answers → 1 RESOLVE pass; no planner re-invocation; status-bump edited directly). Continue; it's why waste stayed at 0.

## Trend (from ledger.md)
- **Waste stays at zero** for a third straight gated phase (SPEC-07 plan, this run) — front-loaded process-gating is now reliably eliminating rejected launches (contrast SPEC-04 plan's ~31% waste, SPEC-07 write-spec's 2 rejected launches).
- **Plan-phase cost trending down**: 148k (SPEC-02) → 146k (SPEC-05) → 151k (SPEC-07) → **113k (SPEC-08)** — a genuinely smaller fix + a pre-grounded launch brief held the planner well under the ~150k baseline.
- **New failure mode vs prior rows**: earlier waste was *process* (killed/duplicate planners, lost async agents); this run's only inefficiency was a *product-model* assumption re-litigated at the gate — a subtler front-loading gap that process-gating discipline alone doesn't catch.
