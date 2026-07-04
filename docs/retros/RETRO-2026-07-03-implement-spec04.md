# Workflow Retro — /implement (SPEC-04 PR Why+Risk Brief) · 2026-07-03
Scope: full `/implement` for SPEC-04 — BUILD (Wave A/B/C) → REVIEW (plan-verifier ∥ arch-reviewer ∥ /code-review 5-finder fan-out) → FIX loop → runtime VERIFY → **plus** two user-directed post-verify feature iterations (internal-diff-link, then its scroll fix) that were later **reverted**, and Phase-4 pr-self-review + fixes → push → PR #11.
Source: in-context task-notification `<usage>` blocks (complete — no fallback script needed).

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|--------|-----------|----------|------|
| 1 | T1 Brief contract | Build A | sonnet | ✅ | 95,531 | 30 | 3.6m | disjoint, first-try green |
| 2 | T2 _shared ref loaders | Build A | sonnet | ✅ | 84,634 | 28 | 3.5m | behavior-preserving lift |
| 3 | T3 container.blast facade | Build A | sonnet | ✅ | 123,476 | 41 | 4.9m | + zero-LLM unit test |
| 4 | T4 brief server module | Build B | sonnet | ✅ | 218,339 | 98 | 9.6m | **biggest unit** (routes+svc+repo+helpers+prompt+tests) |
| 5 | T5 client hooks | Build B | sonnet | ✅ | 84,365 | 16 | 1.6m | **cheapest**; floated T6 after |
| 6 | T6 PrBriefCard + OverviewTab | Build C | sonnet | ✅ | 158,215 | 80 | 7.4m | ran alongside T4 |
| 7 | plan-verifier | Review | sonnet | ✅ | 153,090 | 50 | 4.6m | 15/16 → flagged AC-9 PARTIAL |
| 8 | architecture-reviewer | Review | sonnet | ✅ | 97,537 | 26 | 2.1m | 0 violations |
| 9 | code-review Finder A (line) | Review | opus | ✅ | 83,396 | 17 | 3.7m | found AC-9 + risk dedup |
| 10 | code-review Finder B (removed) | Review | opus | ✅ | 55,566 | 14 | 2.2m | [] clean |
| 11 | code-review Finder C (cross-file) | Review | opus | ✅ | 81,371 | 36 | 3.7m | low-conf notes |
| 12 | code-review Finder D (reuse/simp/eff) | Review | opus | ✅ | 67,266 | 10 | 2.0m | cleanup only |
| 13 | code-review Finder E (altitude/sec) | Review | opus | ✅ | 75,168 | 23 | 2.0m | found injection + observability |
| 14 | Fix backend (AC-9 etc.) | Fix | sonnet | ✅ | 177,429 | 63 | 7.6m | 5 fixes; flagged routes.ts gap |
| 15 | Fix client error state | Fix | sonnet | ✅ | 116,996 | 48 | 5.4m | 3 render states |
| 16 | Wire routes.ts onLog | Fix | sonnet | ✅ | 95,553 | 17 | 2.0m | **95k tok for a 1-line wiring** |
| 17 | Review Focus internal-diff links | Post | sonnet | ✅ | 160,751 | 77 | 7.8m | **later REVERTED** |
| 18 | Fix diff-focus scroll wrong-file | Post | sonnet | ✅ | 153,679 | 55 | 6.7m | **later REVERTED** |
| 19 | pr-self-review backend bucket | Phase4 | opus | ✅ | 108,033 | 25 | 2.6m | 0 critical |
| 20 | pr-self-review UI bucket | Phase4 | opus | ✅ | 103,167 | 29 | 2.5m | 0 critical |
| 21 | Fix backend self-review | Phase4 | sonnet | ✅ | 149,281 | 50 | 4.8m | safeParse + dedup |
| 22 | Fix UI self-review | Phase4 | sonnet | ✅ | 97,845 | 24 | 2.6m | i18n plural |

## Metrics
- **Agents: 22 launched, all completed** · 0 failed/killed/retried · **Fix-loop rounds: 1** formal (Phase-3, 0 blocking after) + Phase-4 quality round.
- **Tokens: 2,540,688 subagent total** (857 tool-uses). By phase: Build **764,560** · Review **613,394** · Fix **389,978** · Post-verify (reverted) **314,430** · Phase-4 **458,326**.
- **Reverted work: 314,430 tok (12.4%)** — agents 17+18 (internal-diff-link feature built→refined→reverted on a UX call). Not an error; a product decision, but net-zero output.
- By model tier: **sonnet** = the 12 implementers + 2 review gates (~1.71M) · **opus** (inherited by `general-purpose`) = the 5 code-review finders + 2 self-review buckets (~574k). The 7 opus review agents are the cheapest per-agent but the biggest *duplication* pool (below).
- **Parallelism:** Wave A 2.44× · Wave B+C 1.94× · Review 4.35× (7-way) · Fix 1.56× · Phase-4 1.57×. Agent wall ≈ **50.6 min** vs sum-of-agent-time ≈ **88.1 min** → overall **≈1.74×** (excludes user-interaction gaps between phases, which dominated real wall-clock).
- Rework traced to: **spec** (AC-9 model-vs-deterministic divergence → user chose code fix) and **user product decisions** (internal-link feature + revert). **No plan/code defects caused rework.**

## What went well / hard
- **Easy:** T5 (84k/16-tool/1.6m) — smallest, clean. Finders D/B — low tool-use, decisive. The 7-way Review fan-out parallelized at **4.35×** — the healthiest parallelism of the run.
- **Hard:** T4 (218k/98-tool/9.6m) — the monolithic backend unit; unavoidably large (whole module). The two reverted UI agents (17+18, 314k combined) were hard *and* discarded.
- **Clean gates:** every review/verify gate ran first-try, 0 agent failures across 22 launches — launch discipline held.

## Duplicated context (redundant grounding)
- **The 30-file SPEC-04 diff was independently re-read by NINE review agents** — 2 gates (plan-verifier, arch-reviewer) + 5 code-review finders (Phase 2) + 2 pr-self-review buckets (Phase 4). I injected a shared *text* pack (diff range + file list + flagged notes), but each agent still `git diff`'d and Read the same files in its own context. This is the **4th consecutive retro** confirming [[parallel-gate-agents-share-context-pack]] — and this run **amplified** it from 2 gates to 9 agents via the finder fan-out.
- **Every implementer worktree started with zero `node_modules`** → each paid a fresh `pnpm install` (+ `npm install` in `reviewer-core/`) before typecheck/tests. ~10 implementer launches × that setup toll. Recurring ([[running-gates-env-gotchas]]).

## Missed / rework
- **The `routes.ts` onLog wiring became a standalone 95k-token agent (#16)** because the backend fix agent (#14) was scoped to exclude `routes.ts`. The service gained an optional `onLog` param but its only caller wasn't wired — an obvious dependent one-liner that should have been in #14's file scope. A 95k-token / 2-min agent (+ worktree install) for one line.
- **The scroll bug (#18, 153k) existed only because #17's jsdom tests couldn't catch it** — `scrollIntoView` is stubbed in jsdom and the smart-diff reorder isn't reproduced, so 9 green unit tests shipped a wrong-file scroll. Caught only by the *user* in a real browser. Then both were reverted.
- **UI live-render was never verifiable by the orchestrator** — the studio's client data queries never fire in a headless/controlled browser (auth-bootstrap gate), so AC-12/13/14 pixel behavior leaned entirely on unit tests + API-data checks. The one UI runtime bug (scroll) slipped precisely there.

## Recommendations (highest-leverage first)
1. **Collapse the review-gate grounding into one shared read.** The finder fan-out re-reads the diff 5×; the gates add 2 more; Phase-4 adds 2. Extract the diff+files ONCE (a cheap pre-step or a single grounding agent) and pass excerpts, OR cut the code-review finder count (5→2–3 angles) unless the diff is large/risky. Biggest single saving — Review was 613k tok, much of it duplicated grounding. (4th confirmation → promote to standing /implement Phase-2 practice.)
2. **Scope implementer file-sets to include obvious dependent wiring.** When a fix adds a param/export, its sole caller is part of the same unit — don't spawn a follow-up agent for it. Would have folded #16 into #14 (~95k + a worktree install saved).
3. **Pre-provision worktree `node_modules`.** Symlink/copy or a shared pnpm store at worktree creation so ~10 implementers skip a from-scratch install each. Recurring toll across every /implement run.
4. **Don't trust jsdom for runtime-UI behavior (scroll/layout/position).** For DOM-position features, either drive a real browser before committing or explicitly mark the behavior untestable-in-unit — the scroll cycle cost 314k tok build+fix and still shipped a bug the unit tests "passed." Ties to [[verify-real-functionality-not-mocks]] and the headless auth-gate blocker.
5. **Budget-flag exploratory UI churn.** 12.4% of tokens went to a feature built, refined, then reverted on a UX call. Legitimate, but a lighter spike (mock/screenshot) before a full implementer+test cycle could de-risk reversible UI experiments.

## Trend (vs prior retros)
- IMPLEMENT SPEC-02 wave C (6 agents) → SPEC-03 (7 agents) → **SPEC-04 (22 agents)**. The jump is real scope, not waste: SPEC-04 ran the *full* pipeline (5-finder code-review + fix loop + runtime verify + 2 user feature iterations + Phase-4 self-review + push/PR), where SPEC-02/03 retros stopped at the pre-push gate.
- **Parallelism steady** (~1.66× → 1.74×). **0 agent failures** (SPEC-03 had a session-limit truncation; this run had none — units were sized smaller, esp. splitting build waves).
- **Recurring, now un-ignorable:** parallel-gate context duplication (**4×**) and worktree node_modules cost (**3×+**). Both should stop being per-run notes and become standing orchestration practice/tooling.
