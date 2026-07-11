# Workflow Retro — /implement (SPEC-08 Idempotent Export to CI) · 2026-07-10
Scope: build → review → fix → verify → gate. Phase 1 (implementer-backend), Phase 2 (3 read-only gates), Phase 3 (fix loop — empty), Phase 3.5 (main-thread runtime verification), Phase 4 (gate — user held). · Source: in-context task-notification `<usage>` blocks. **No nesting** (implementer + review agents spawn no subagents; the code-review finder returned NO FINDINGS so no verifier launched) → token total is **firm, not ~partial**.

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (subagent) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-------------------|-----------|-----------|----------|------|
| 1 | implementer-backend | BUILD | opus | completed | 170,674 | ? | 66 | ~443s | S1–S4 in worktree; heavy setup (server deps + reviewer-core `npm ci` + build agent-runner/dist via ncc) before a 4-file change + 295-line test; its `.it` self-skipped (no Docker in its env) |
| 2 | plan-verifier | REVIEW | sonnet | completed | 89,427 | ? | 17 | ~176s | 7/7 AC MET, 0 gold-plating; re-ran tsc + vitest itself (redundant) |
| 3 | architecture-reviewer | REVIEW | sonnet | completed | 67,372 | ? | 13 | ~80s | 0 violations / 0 smells; ran under plan-verifier's shadow (parallel) |
| 4 | code-review finder | REVIEW | sonnet | completed | 63,184 | ? | 6 | ~56s | Single focused correctness finder (not the 8-angle fan-out); NO FINDINGS → no verifier spawned |

Cache-hit `?`: notifications carry only aggregate `subagent_tokens` (no in/out/cache-read split) — same limitation as every prior ledger row.

## Metrics
- **Agents: 4 launched (4 productive · 0 wasted/retried)** · **Fix-loop rounds: 0** (no blocking findings)
- **Tokens: 390,657 total** (firm). By phase: BUILD 170,674 · REVIEW 219,983. By tier: **opus 170,674** (implementer) · **sonnet 219,983** (3 review agents).
- **Cache-hit: unknown** · **Tool-calls: 102** (66+17+13+6)
- **Wall-clock vs sum-of-agent-time:** sum ≈ 755s (~12.6 min). Agent-portion wall-clock ≈ 674s (~11.2 min): build solo (443s) → review [plan-verifier ‖ arch-reviewer barrier = max(176,80)=176s] → code-review finder sequential (56s, launched after the diff was fetched). **Parallelism ≈ 1.12×** — only the 2-agent review barrier overlapped; arch-reviewer (80s) ran entirely inside plan-verifier's 176s shadow.
- **Failures/retries: none.** No killed/duplicate launches. **Rework in the agent graph: none.**
- **Runtime verification (main-thread, 0 agent tokens):** 7/7 `.it` vs real Postgres; a real export drove the real Octokit reset → `devdigest/ci` reset to base + one manifest (2 commits → 1), `performance-reviewer.yaml` dropped; **PR #22 CI `review` check flipped to success**. True end-to-end, not mocked.

## What went well / hard
- **Went well — real end-to-end verification actually happened.** Prior retros (SPEC-03) flagged "mocked-green ≠ done"; this run closed it: the `.it` ran against real Postgres AND a real export validated the real Octokit reset on real GitHub, fixing PR #22's CI for real. Phase 3.5 did its job.
- **Went well — cheapest, cleanest implement in the ledger.** 4 agents / 0 waste / 390k tokens vs SPEC-07's 716k (4/2 wasted) and SPEC-04's 2.54M (22 agents). Drivers: tiny single-file-scope change, single-agent build, **cost-scaled /code-review** (1 finder, not 8 finders + verifiers), 0 fix rounds.
- **Hard — implementer-backend was the cost + tool-use outlier** (170k / 66 tool-uses / 443s, the token majority). The 4-file code change is small; the bulk was **worktree setup** — a fresh worktree off HEAD has no `node_modules`, no `reviewer-core` deps, no `agent-runner/dist`, so it re-installed all three and rebuilt `dist` via ncc (the main worktree already had them). Setup, not implementation, dominated.
- **Easy — the 3 review gates.** All fast/clean on sonnet; the code-review finder (6 tool-uses, NO FINDINGS) and arch-reviewer (80s) were cheap; the sonnet downgrade showed no false verdicts.

## Duplicated context (redundant grounding)
- **All 3 review agents independently re-ran `git diff` + read the same 4 changed files.** I did inject a **shared context pack** (file list + each file's role) into all three briefs — which helped scope them — but independent verification still means each re-reads source. Inherent, but the pack kept it from being worse.
- **plan-verifier re-ran `tsc` + `vitest` itself** — already run by the implementer and again by me at integration (3× total). Cheap compute, but plan-verifier's job is coverage tracing, not re-executing the suite; it could trust the reported green.
- **agent-runner/dist was built twice** — once in the main worktree (earlier this session) and again inside the implementer's isolated worktree. Worktree isolation forced the rebuild.

## Missed / rework
- **Environment precondition (Docker) not checked before the run.** Docker Desktop's Linux engine went down between session start and this run; Phase 3.5 + the `.it` suite hard-depend on it, so verification **stalled mid-run** and needed a user round-trip ("start Docker"). A `docker info` check at Phase 0 INTAKE would have surfaced it before the build.
- **Split verification — the implementer could not self-verify its own DB-backed test.** Its worktree env lacked Docker, so `ci-export.it.test.ts` self-skipped there; the actual green came from a **main-thread** run later (Docker restored). Implementer "green" for this unit was really tsc + unit-only; the DB-backed proof was deferred to integration. Not a defect, but an unplanned handoff.
- **Plan imperfection caught at implement (pattern continues).** The plan's AC-6 case named `target:'local'`, not a real `CiTarget` enum member; the implementer correctly substituted `'cli'`. Same shape as SPEC-08-plan catching the spec's dual-vendor error — each phase catches the prior's small inaccuracies.

## Recommendations (highest-leverage first)
1. **Add a Docker/env precheck at Phase 0 of /implement when the plan has `.it` tests or a Phase 3.5 runtime drive.** A one-line `docker info` (and a note if down) surfaces the blocker before the build wave, avoiding the mid-run stall + user round-trip. *Saves a broken verification phase + a context-switch.*
2. **Treat DB-backed `.it` green as a main-thread integration step, not an implementer deliverable, when the implementer's worktree lacks Docker.** Either provision Docker in the implementer env or state up-front "implementer greens tsc + unit; main thread runs `.it` at integration." Removes the surprise. (Relates to the mocked-green discipline.)
3. **Let plan-verifier trust the reported test result instead of re-running the suite.** Its value is coverage/traceability + non-functional/DoD checks; re-executing tsc+vitest is redundant compute already done twice elsewhere. *Trims a few tool-uses/tokens.*
4. **Keep scaling the /code-review fan-out to diff size.** 1 focused finder (63k) on a 60-line, twice-reviewed diff found the same "nothing" that 8 finders + verifiers (~400k projected) would — the amplifier stays suppressed. Reserve the full fan-out for large/risky diffs.
5. **For a tiny single-file-scope backend change, weigh worktree-isolation setup cost.** The implementer's dominant cost was re-installing deps + rebuilding agent-runner/dist that the main worktree already had. Isolation is the safe default (keep it) — but flag that for trivial diffs the setup tax can exceed the implementation.

## Trend (from ledger.md)
- **Cheapest + zero-waste implement to date.** Implement rows: SPEC-02 ~225k (6/1), SPEC-03 ~721k (7/0), SPEC-04 2.54M (22/0), SPEC-07 716k (4/2) → **SPEC-08 390,657 (4/0)**. Smallest scope + cost-scaled review + single-agent build.
- **Waste stays at 0 for a fourth consecutive phase** (SPEC-07 plan, SPEC-08 spec+plan, SPEC-08 implement) — launch discipline is holding.
- **/code-review amplifier stays suppressed** — SPEC-04's 5-finder fan-out (the historic top amplifier) is now consistently scaled down (SPEC-07 used 2 reviewers on a shared pack; this used 1 finder). 
- **New friction class:** earlier friction was launch discipline (killed/duplicate agents) then product-model assumptions (SPEC-08 spec); this run's only friction was an **environment precondition** (Docker) unverified before a Docker-dependent verification phase — the next discipline to front-load.
