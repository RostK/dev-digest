# Workflow Retro — implement (SPEC-07 Export to CI) · 2026-07-09
Scope: build (Wave 2: T3 backend ‖ T4 UI) + review gates (plan-verifier ‖ architecture-reviewer), main-thread orchestrated (not the packaged `/implement` skill). Wave 1 was carried in from a prior session; the fix-loop + `/verify` + push/PR ran in the main thread. Source: in-context task-notifications (`<usage>`), no nesting → real totals; 2 killed launches un-metered (no `<usage>` in kill notice).

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-----------------|-----------|-----------|----------|------|
| 1 | implementer-backend (T3, 1st) | Build | sonnet | KILLED | unknown | ? | unknown | ~short | forked `feat/l07` (main checkout) which LACKED Wave 1 → stopped before real work |
| 2 | implementer-ui (T4, 1st) | Build | sonnet | KILLED | unknown | ? | unknown | ~short | same stale fork-base; stopped |
| 3 | implementer-backend (T3, 2nd) | Build | sonnet | completed | 178,372 (combined) | ? | 52 | 485s (8.1m) | clean; self-flagged the CiExport nullability deviation |
| 4 | implementer-ui (T4, 2nd) | Build | sonnet | completed | 269,338 (combined) | ? | 137 | 1043s (17.4m) | outlier on every axis — 24 files, wizard + i18n + nav |
| 5 | architecture-reviewer | Review | opus | completed | 128,102 (combined) | ? | 41 | 283s (4.7m) | found V-01 (YAML-injection) + V-02 (contract) |
| 6 | plan-verifier | Review | opus | completed | 140,975 (combined) | ? | 50 | 299s (5.0m) | AC-1..20 traceability; confirmed AC-4 gap |

(`<usage>` reported a single `subagent_tokens` per agent — no in/out or cache-read split; cache-hit therefore `?`.)

## Metrics
- Agents: **6 launched (4 productive · 2 wasted/killed)** · Fix-loop rounds: **0** (all 4 review findings folded into the main thread — no fix subagents)
- Tokens: **716,787 known** (2 killed un-metered) · Build 447,710 (sonnet) · Review 269,077 (opus) · Cache-hit: unknown
- Tool-calls: **280** (productive; killed unknown)
- Wall-clock ≈ **1,342s** (build wave max(485,1043)=1043 + review wave max(283,299)=299) vs sum-of-agent-time **2,110s** → **∥ ≈ 1.57×**
- Failures/retries: **2 killed launches** (T3+T4 first) — cause: isolated implementers fork from the **main-session checkout** (`feat/l07`), which lacked Wave 1; fixed by `git merge --ff-only` of Wave 1 into `feat/l07`, then relaunch. Rework traced to: **orchestration setup (worktree fork-base)** — not spec, plan, or code.

## What went well / hard
- **Hard: T4 (implementer-ui)** — 269k tok / 137 tool-uses / 17.4m, the outlier by every measure (24 files: 4-step wizard, CI tab, CI Runs page, hooks, nav, i18n). Completed without truncation but sat near the risk line.
- **Easy: both reviewers** — single clean pass each (~128–141k, 41–50 tools, <5m), no blockers, high yield: 2 violations + the AC-4 gap, all real and fixed.
- **Moderate: T3** — 178k / 52 tools / 8.1m, finished ~9m before T4; I integrated + typechecked T3 while T4 still ran (no idle barrier).

## Duplicated context (redundant grounding)
- The **shared context pack was injected once** to both reviewers (good — the mitigation worked). But the pack referenced **paths, not contents**, so plan-verifier and architecture-reviewer each independently re-read `SPEC-07`, the plan, and the same `server/src/modules/ci/*` files. Embedding the key file bodies / a precomputed diff in the pack would remove that second read.
- Both implementers independently read the plan + spec + a sibling module for conventions — inherent to isolated worktrees, low-priority.

## Missed / rework
- **2 killed launches** = pure waste from the worktree fork-base trap (isolated agents fork from the session checkout, not the sibling `export-to-ci` worktree where the work lived).
- **Cross-unit seams surfaced only at review** (T3/T4 are compile-independent by design): `CiExport.installation` nullability (T3 self-flagged), the AC-4 edited-workflow being silently discarded, and V-01 `triggers` YAML-injection. All caught by the review gates + fixed in the main thread.
- `client/src/components/app-shell/helpers.ts` nav-highlight wiring was **out of T4's file scope**; folded in by the main thread (one line).

## Recommendations (highest-leverage first)
1. **Pre-launch fork-base assertion for isolated implementers.** The 2 killed launches were avoidable. Before any isolated fan-out, verify the base carries the feature: `git worktree list --porcelain | grep -A1 agent-<id>` HEAD == the feature commit, OR confirm the session-checkout branch already contains it. (Already routed to memory this session — reinforce as a standing launch gate.)
2. **Pack should embed contents, not just paths** for parallel review gates — precompute the diff / inline the load-bearing files once so N reviewers don't each re-read them. Expected: lower review-phase tokens (269k here).
3. **Keep the fix-loop in the main thread for mechanical/contract fixes** — 0 fix subagents this run (vs 1 in SPEC-04, 1+1 in SPEC-02). Folding V-01/V-02/AC-4/nit inline avoided ~2 launches; keep this default.
4. **Decide cross-unit contract shapes in Wave 1.** `CiExport.installation` nullability was knowable at contract time; nailing it up front would have removed a review-round fix for the compile-independent UI/backend split.
5. **Split the UI unit when it's this large.** T4 (269k / 137 tools) is the truncation-risk outlier — future large UI units split (e.g. Wizard vs CI-tab+Runs) stay measurable and safer.

## Trend (from ledger.md)
- **Waste returns, new root cause.** 2/6 wasted echoes the recurring orchestration-discipline waste (SPEC-04 plan 2 wasted; SPEC-07 write-spec 2 wasted) — but the cause rotates each time (global spec-ID → then worktree fork-base). Same fix every time: front-load launch preconditions.
- **Review discipline held.** 2 reviewers on ONE shared pack (269k) vs the SPEC-04 5-finder `/code-review` fan-out that blew tokens to 2.54M — the amplifier stayed suppressed. Fix-loop **0** continues the downward rework trend (SPEC-04 had 1).
- **Token total (716,787 known)** sits in the SPEC-03 band (~721k / 7 agents) but with tighter parallel-review scoping; build (447k) dominated, not review.
