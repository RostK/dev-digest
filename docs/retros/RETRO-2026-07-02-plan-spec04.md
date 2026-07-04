# Workflow Retro — SDD write-spec + plan-implementation (SPEC-04) · 2026-07-02
Scope: the SPEC-04 "PR Why+Risk Brief" spec-authoring loop (`/write-spec`) and planning loop
(`/plan-implementation`) — through plan draft, BEFORE persist/GATE (user interrupted to run this
retro). Source: in-context task-notifications (`<usage>` blocks) + my own orchestration record.

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|--------|-----------|----------|------|
| 1 | spec-author (AUTHOR) | write-spec DRAFT | default | completed | 123,942 | 40 | 6.6 min | drafted SPEC-04, returned 6 NC markers |
| 2 | spec-author (RESOLVE) | write-spec RESOLVE | default | completed | 117,024 | 54 | 9.5 min | folded 6 NC answers → auto-raised to `approved` (later reverted to `draft` per user) |
| 3 | implementation-planner (1st) | plan PLAN | opus | **killed** | unknown | unknown | unknown (mid-run) | launched by auto-chain into `/plan-implementation`; killed when user said "нічого без мене не запускай" |
| 4 | implementation-planner (2nd) | plan PLAN | opus | completed | 178,404 | 49 | 12.2 min | full grounded plan; handled subagent-AskUserQuestion gap by baking recommended defaults |
| 5 | implementation-planner (2nd, **resumed**) | plan PLAN | opus | completed | 191,185 | 49 | 13.9 min | **DUPLICATE** — my SendMessage resumed an ALREADY-completed agent; re-produced the same plan |

## Metrics
- **Agents:** 5 launches across 3 distinct IDs (planner launched/killed once, then run + redundantly resumed). **3 productive · 2 wasted** (1 killed, 1 duplicate).
- **Tokens:** 610,555 known + 1 unknown (killed planner). **Wasted ≈ 191,185 known** (the duplicate resume) ≈ **31% of known tokens**, plus the killed run's unmeasured tokens.
  - By phase: write-spec 240,966 (2 agents) · plan 369,589+ (3 launches, 2 of them waste).
  - By tier: opus = the planner (369,589+ across 3 launches); spec-author = its default tier.
- **Parallelism:** none this run — every agent ran serially (spec phases are inherently sequential; planning is a single agent). Sum-of-agent-time (known) ≈ 42 min, wall-clock ≈ same + inter-phase user Q&A. Parallelism factor ≈ 1. (The plan it PRODUCED designs 3 parallel groups for `/implement` — but that is future work, not this run.)
- **Fix-loop rounds:** n/a (no `/implement` yet).
- **Failures/retries:** planner killed ×1 (premature launch) + planner resumed redundantly ×1 (duplicate). Rework traced to: **orchestration** (launch/resume discipline), not spec or plan quality.

## What went well / hard
- **Easy / clean:** spec-author AUTHOR + RESOLVE — one pass each, closed all 6 NCs, returned a machine-readable NC list; the write-spec loop worked exactly as designed.
- **Productive-but-heavy:** the planner (#4) — 178k tokens / 49 tool-uses / 12 min. The planning was genuinely hard (a cross-module composition feature: it had to verify the pre-shipped `pr_brief` table, `PrBrief`/`Risk` contracts, `risk_brief` feature-model, `reviewRepo` methods, the `conventions` grounding pattern, the `blast` 2nd-LLM-call trap). The high cost was justified — but 2 of the 3 planner launches were pure waste.
- **Hard / wasteful:** launches #3 (killed) and #5 (duplicate) — ~14 min + 191k+ tokens produced nothing new.

## Duplicated context (redundant grounding)
- **Planner #4 vs #5 re-read the SAME ~49 files** (`contracts/brief.ts`, `container.ts`, `blast/*`, `intent-service.ts`, `conventions/service.ts`, `schema/reviews.ts`, …) — the resume re-grounded from scratch (~191k tokens) to re-produce a plan #4 had already delivered.
- **Cross-phase:** spec-author (×2) AND planner (×2) each independently re-read the core pre-shipped pieces (`brief.ts` contracts, `blast`, `intent-service`, `schema/reviews.ts`). No shared grounding pack spanned the write-spec → plan handoff.

## Missed / rework
- **Subagents can't `AskUserQuestion`.** The `implementation-planner` has `AskUserQuestion` in its tool set and TRIED to use it — it "errored out in-subagent, so nothing was asked." The user noticed ("planner wanted askUserQuestions"). The plan-implementation skill already ANTICIPATES this (main-thread owns Q&A) — but the tool being present invites the failed attempt + the confusion that led to the redundant resume.
- **Redundant SendMessage-resume.** I reacted to the user's observation by sending the planner a "return questions as text" redirect — but it had ALREADY completed (the SendMessage result said "stopped (completed); resumed…"). The resume was a full duplicate planning run. I should have checked for the completion first.
- **Premature auto-launch.** Planner #3 was launched by auto-advancing into `/plan-implementation` before the user was ready (spec not yet manually approved; user wanted to gate launches) → killed + branch fold-back + spec re-approval. Already captured this session as memory `user-gates-sdd-launches-and-approval`.

## Recommendations (highest-leverage first)
1. **Remove `AskUserQuestion` from `implementation-planner`'s tools** (and add a one-line "return open questions as a numbered text list with recommended defaults; you cannot prompt the user" to its prompt). It errors in-subagent and invites a wasted redirect/resume cycle. Mirror this for `spec-author` (already returns NC markers, but has no AskUserQuestion — keep it that way). **Expected saving: ~1 planner launch (~180k tokens) + the confusion.**
2. **Check a background agent's latest result BEFORE SendMessage-resuming it.** If a completion notification exists (or `TaskGet` shows completed), read that result instead of redirecting — a resume re-runs the whole agent. Cost avoided here: **191k tokens / ~14 min.** (Ties to `background-agents-lost-on-restart`.)
3. **Don't auto-advance SDD phases** — each phase launch waits on the user's explicit "go" (spec approval is manual; plan approval is manual). Already memory (`user-gates-sdd-launches-and-approval`); this run cost the killed planner #3, confirming the rule.
4. **Inject a one-time "SPEC-04 grounding pack" across the spec→plan phases** — the pre-shipped facts (the `pr_brief` table shape, `PrBrief`/`Risk` contracts + `PrBrief`-is-unused, the `risk_brief` feature-model, the `reviewRepo` cross-module getters, `wrapUntrusted`, the `conventions` grounding-drop pattern, the `blast` 2nd-LLM-call trap) were re-discovered by 4 agents. Passing them as a shared context block in each brief would cut re-grounding. (Ties to `parallel-gate-agents-share-context-pack`.)

## Trend (vs prior retro)
- Prior: `RETRO-2026-07-02-implement-spec03.md` (a different workflow — `/implement` build→review). Limited direct comparison, but a **recurring theme** links them: the subagent-can't-prompt-the-user limitation. There it was designed-around in the loop skills; here it surfaced as a live planner error + a duplicate launch. Fixing rec #1 closes it at the agent level.
- **Waste profile this run:** 2 of 5 launches wasted (~31%+ of tokens) — all orchestration (launch/resume discipline), zero from spec/plan quality. The artifacts (spec, plan draft) were first-pass clean.
