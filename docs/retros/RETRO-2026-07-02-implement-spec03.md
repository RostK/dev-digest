# Workflow Retro — /implement (SPEC-03 Onboarding Generator) · 2026-07-02
Scope: SDD **IMPLEMENT** phase for SPEC-03 — BUILD (Wave A T1∥T2 → Wave B T3∥T4) + a gap-fill it-test + REVIEW (plan-verifier ∥ architecture-reviewer). Fix-loop: 0 rounds (all gates clean). Stopped at the pre-push gate.
Source: in-context task-notification `<usage>` — **partial**: T3 & T4 were truncated by a session/usage limit, so their token counts are underreported (the notification captured only the truncated tail) and marked `unknown`.

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|--------|-----------|----------|------|
| 1 | implementer-backend (T1 contracts + prompt) | Build/A | inherit | completed | 113,990 | 33 | 3.3 min | clean, first-try green |
| 2 | implementer-backend (T2 jobs completion-hook) | Build/A | inherit | completed | 111,892 | 39 | 4.5 min | clean, hook test 3/3 |
| 3 | implementer-backend (T3 onboarding module) | Build/B | inherit | completed* | **unknown** (tail 1,679) | 111 | 21.0 min | **truncated by session limit** before greening its own test; worktree output intact; wrote unit test but NOT the .it.test |
| 4 | implementer-ui (T4 Onboarding Tour screen) | Build/B | inherit | completed* | **unknown** (tail 1,780) | 123 | 19.5 min | **truncated by session limit** before greening its own test; worktree output intact |
| 5 | implementer-backend (it-test onboarding.it.test.ts) | Build (gap-fill) | inherit | completed | 194,188 | 58 | 9.5 min | closed the T3 .it.test gap; 5/5 under Docker; no prod change |
| 6 | plan-verifier | Review | sonnet | completed | 194,989 | 57 | 4.6 min | 24/24 AC MET · Accept |
| 7 | architecture-reviewer | Review | sonnet | completed | 106,467 | 42 | 3.2 min | 0 violations · 1 non-blocking smell · Approve |
| — | inline /code-review (main thread) | Review | — | completed | 0 (main) | — | — | 0 correctness bugs; done inline (avoids the Workflow route the user declined earlier) |

## Metrics
- Agents: **7 launched, all productive** · 0 wasted/duplicate/retried launches · Fix-loop rounds: **0** (all three gates clean).
- Tokens: **721,526 known** (T1+T2+it-test+plan-verifier+arch-review). **T3 & T4 unknown** (session-limit-truncated; real usage almost certainly ~150–250k each given 111/123 tool-uses over ~20 min, but not captured). By phase (known): Build ≈ 420,070 + T3/T4 unknown · Review = 301,456. Review ran on **sonnet** (sanctioned cost downgrade).
- Wall-clock vs sum-of-agent-time (parallel groups): Wave A ≈ max(3.3,4.5)=**4.5 min** (sum 7.8, 1.73×) · Wave B ≈ max(21.0,19.5)=**21.0 min** (sum 40.5, 1.93×) · it-test 9.5 min (sequential) · Review ≈ max(4.6,3.2)=**4.6 min** (sum 7.8, 1.70×). Total agent wall-clock ≈ **39.6 min** vs sum ≈ 65.6 min → **parallelism ≈ 1.66×**.
- Failures/retries: **0 agent failures, 0 re-launches.** The dominant event was the **session-limit truncation of T3 & T4** (biggest units) — they finished the code (worktree output survived) but lost their final report + didn't green their own tests. Rework traced to: **harness (usage limit)**, not spec/plan/code — the main thread reconciled **4 over-strict/mismatched test assertions** (server: used_by method+path count, getContext≥routes; client: ambiguous getByText→role/id queries ×2, mermaid aria-label whitespace normalization) against verified-correct production, and launched **1 extra agent** (the it-test) to fill T3's missed .it.test.

## What went well / hard
- **Hard — T3 & T4** (the two biggest units, 111/123 tool-uses, ~20 min each): not only the heaviest, but both **truncated by the session limit** before greening tests. This is the run's defining friction. Their worktree output was complete and integrable (good — matches [[background-agents-lost-on-restart]]'s worktree-survives refinement), but the missing test-green forced main-thread reconciliation + a gap-fill agent.
- **Hard — the it-test agent** (194k tok, 9.5 min): heavy but clean — it existed only because T3's DoD-mandated .it.test was truncated away. A cost directly attributable to the truncation.
- **Easy — T1, T2**: small, disjoint, first-try green, well-parallelized (1.73×). **plan-verifier + arch-review**: both clean (Accept/Approve), parallel (1.70×), sonnet — the healthy part of the run.

## Duplicated context (redundant grounding)
- **plan-verifier + architecture-reviewer both ran `git diff 894657e..HEAD` and re-read the same onboarding files** — the exact parallel-gate duplication captured in [[parallel-gate-agents-share-context-pack]]. **Third retro in a row** confirming it (plan retro predicted it; SPEC-02 implement retro confirmed it; here again).
- **Every fresh-worktree agent (T1–T4, it-test) re-installed node_modules** (server `pnpm install` + `reviewer-core` `npm install`) because a fresh worktree has none — a repeated per-agent overhead ([[running-gates-env-gotchas]]).

## Missed / rework
- **T3 missed its DoD-mandated `.it.test.ts`** (truncated) → required a **separate 6th agent** (~194k tok / 9.5 min) to write it. The biggest single avoidable cost of the run.
- **T3 & T4 left their own unit/component tests un-green** (truncated mid-red→green) → 4 main-thread test-assertion reconciliations before integration could go green. All were test-assertion issues (production verified correct), not production bugs — but they were rework the orchestrator absorbed.
- No duplicate launches, no re-dispatches for wrong scope, no spec/plan defects surfaced.

## Recommendations (highest-leverage first)
1. **Split the largest task units so no single implementer runs ~20 min / 100+ tool-uses.** T3 bundled service + routes + repository + facts + constants + helpers + job wiring + unit test — too much for one agent under a usage-limit ceiling. Splitting (e.g. module-core vs facts/generation, or module vs its own `.it.test`) would have kept each agent short enough to finish + green its tests before any limit. — biggest resilience win.
2. **Treat a truncated big-unit agent as "output-complete, tests-unverified."** The orchestrator must re-run the unit's tests on integration and expect to reconcile un-green assertions (I did) — bake this into the /implement integrate step rather than trusting a (missing) green summary. The worktree output survives; the "green" claim does not.
3. **Inject one shared "diff + plan + touched-files" context pack for the parallel review gates** (plan-verifier + arch-review). Re-confirmed a 3rd time — promote from recommendation to standing /implement Phase-2 practice. → [[parallel-gate-agents-share-context-pack]].
4. **Pre-provision worktree node_modules** (template/symlink) so each implementer doesn't pay the server-pnpm + reviewer-core-npm install tax on a fresh worktree. → [[running-gates-env-gotchas]].
5. **Keep doing the inline /code-review in the main thread** — it added the correctness gate (0 bugs) without a 3rd background agent, and sidestepped the Workflow route the user had declined. Cheap and effective.

## Trend (vs prior retros)
- **PLAN** (RETRO-2026-07-02-plan-implementation): 1 agent · 148k · ~12 min · 0 rework.
- **IMPLEMENT SPEC-02 wave C** (RETRO-2026-07-02-implement): 6 agents · review parallelism 1.66× · dominant cost = a **restart re-drive**.
- **IMPLEMENT SPEC-03 (this)**: **7 agents** · parallelism **1.66×** (steady) · 0 fix-loop rounds · **24/24 AC MET, 0 violations** · dominant cost = a **session-limit truncation** of the 2 biggest units → +1 gap-fill agent + 4 reconciliations. Two prior recommendations recur: **shared context pack for parallel gates** (now 3×) and **worktree node_modules cost** — both should stop being per-run notes and become standing practice.
