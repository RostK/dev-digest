# Workflow Retro — /implement (SPEC-02 wave C) · 2026-07-02
Scope: SDD **IMPLEMENT** phase for SPEC-02 (Project Context), **Group C** (T6/T8/T9/T10) — build fan-out → integrate → review gates → fix → follow-ups. Spans TWO sessions: the Group C build ran in a prior session (`3d963afd`) that was lost on restart; integration + review + finalization were re-driven in this session (`fbefc4c8`).
Source: **partial** — this session's in-context task-notification `<usage>` for the 2 review agents (exact); the 4 Group C implementers' telemetry is **unknown** (prior-session notifications lost on restart; their `tasks/*.output` transcripts are 0 bytes on disk).

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|--------|-----------|----------|------|
| 1 | implementer-backend (T6 run-executor injection · `ad49d7eb`) | Build (Group C) | unknown | completed | unknown | unknown | unknown | Output survived in worktree; integrated this session. Telemetry lost on restart. |
| 2 | implementer-ui (T8 agent Context tab · `ac944c0a`) | Build (Group C) | unknown | completed | unknown | unknown | unknown | worktree output integrated |
| 3 | implementer-ui (T9 skill Context section · `a1ec7496`) | Build (Group C) | unknown | completed | unknown | unknown | unknown | worktree was **locked**; output integrated |
| 4 | implementer-ui (T10 run-trace surfacing · `a27435e9`) | Build (Group C) | unknown | completed | unknown | unknown | unknown | worktree output integrated |
| 5 | architecture-reviewer (`af953550`) | Review | opus | completed | 93,922 | 39 | 3.9 min (234,560 ms) | 0 violations · 3 non-blocking smells · parallel with #6 |
| 6 | plan-verifier (`a5ff31a1`) | Review | opus | completed | 131,559 | 45 | 6.0 min (357,120 ms) | 19/22 AC MET · 0 blocking · parallel with #5 |
| — | code-review Workflow (background, high) | Review | — | **rejected** | 0 | 0 | — | User rejected the tool call; 0 agents spawned. Pivoted to inline review. |

Main-thread work (no subagent tokens): worktree→patch integration of all 4 units; env repair; the /code-review inline pass; the T9 test-defect fix; 3 post-review follow-ups (#1 tile test, #2 mock+it-test, #3 helper dedup) done **inline, no subagents**.

## Metrics
- Agents: **6 launched, all productive** (4 build · 2 review) · **1 rejected** launch (code-review Workflow, 0 cost) · 0 re-launched.
- Fix-loop rounds: **1 in the build/verify** (T9 checkbox-order test) + **1 post-review follow-up round** (inline, 0 agents).
- Tokens: **225,481 known** (Review phase, both opus) · **Build phase unknown** (4 agents). Honest total is therefore a floor, not a sum.
- Wall-clock vs sum-of-agent-time (Review phase, the only measurable parallel group): the 2 reviewers launched in ONE message → wall-clock ≈ **max(3.9, 6.0) = 6.0 min**; sum-of-agent-time = **9.9 min**; **parallelism factor ≈ 1.66×** (arch-review fully overlapped inside plan-verifier's window; ~3.9 min saved).
- Failures/retries: **the whole Group C fan-out was lost on restart** — no agent was re-launched (worktree output survived), but the entire orchestration (integrate/verify/review) was re-driven by hand in a new session. Plus ~30 min of **self-inflicted env breakage** in the follow-up round (parallel same-package `pnpm` wiped `.bin`; reviewer-core npm deps + an openai/node-fetch relink).
- Rework traced to: **harness** (restart) for the re-drive; **code/implement** for the 3 review follow-ups (untested `specs_tokens` tile, weak AC-19 mock, duplicated merge/move helpers) and the T9 test defect. **None traced to spec or plan.**

## What went well / hard
- **Hard — plan-verifier** (131.5k tok · 45 tools · 6.0 min): the single heaviest agent. Justified — it did AC-by-AC traceability across the whole wave-C diff + read the (unrunnable) integration tests. **arch-review** was also substantial (93.9k · 39 · 3.9 min) but lighter.
- **Hard — the resumption itself** (orchestration, not an agent): reconstructing "what ran / what's integrated" from 4 worktrees with **0-byte transcripts** was pure forensics. The build agents themselves were opaque.
- **Easy / clean:** both review agents completed **first try, 0 re-launch**, in parallel, with directly actionable output (arch: 0 violations; plan-verifier: 2 concrete gaps that became the follow-up round). The Review phase is the healthy part of this run.

## Duplicated context (redundant grounding)
- **Both review agents independently ran `git diff HEAD` and re-read the same ~11 wave-C files** (project-context.ts, run-executor.ts, service.ts, helpers.ts, ContextTab, ConfigTab, TraceBody, the two hooks) **+ the plan + the shared ContextDocList + the committed wave A/B context.** This is the exact duplication the PLAN retro predicted for the build phase — it materialized in the **review** phase instead. Had the rejected /code-review Workflow run too, that would have been a **3rd** independent re-grounding of the same diff.
- Candidate: build a **"wave-C diff + plan + touched-file" context pack once** and hand it to every gate agent, instead of each re-deriving it.

## Missed / rework
- **plan-verifier surfaced 2 gaps late** (AC-19 mock ignores `repo`; AC-15 `specs_tokens` tile untested) that should have been caught by the **implementers' own definition-of-done**, not a downstream reviewer. Both became the follow-up round.
- **Integration tests never ran during the build** (Docker was down for the implementers) — so a real per-clone-isolation defect *would* have shipped; only surfaced when Docker came up this session (and even then exposed a `waitForPrRuns` 10s-vs-~11s flake).
- **The T9 test defect** (assumed checkbox order == input order) passed the implementer's own gate only because its T8 sibling happened to have a single unattached doc — a **cross-unit blind spot** of independently-worktree'd agents.
- **1 rejected launch** (code-review Workflow) — overlapped scope with the 2 gate agents already running; picking one review mechanism up front would have avoided the false start.

## Recommendations (highest-leverage first)
1. **Persist a per-run integration manifest** (task → worktree → status → integrated?) so a restart-resumed session detects completed-but-unintegrated worktrees mechanically, instead of forensic reconstruction from 0-byte transcripts. The worktree OUTPUT survives a restart even when the orchestration state and task transcripts do not — lean on that. → routed to memory.
2. **Inject a shared "diff + plan + touched-files" context pack ONCE** for all Review-phase agents (plan-verifier, architecture-reviewer, /code-review). Predicted by the PLAN retro, now confirmed — 2–3 agents re-run the identical `git diff` + file reads. → routed to memory.
3. **Strengthen implementer DoD to self-run available tests and explicitly flag untested surfaces.** The AC-15 tile and AC-19 mock gaps are DoD misses; make "did you test the surface you added, or flag it" part of the implementer contract.
4. **Gate Docker/integration-test availability at build time.** If `.it.test.ts` can't run (no Docker), the run should say so loudly and treat those ACs as *unverified*, not *met* — this run shipped an `app.inject`-without-`await` bug in an it-test that only surfaced when Docker came up.
5. **One review mechanism per gate.** Don't launch background /code-review while plan-verifier + architecture-reviewer already cover the same diff — decide inline-vs-workflow before launching.
6. **Never run two same-package `pnpm` gates concurrently during verification** (cost ~30 min here). → already in memory ([[running-gates-env-gotchas]]).

## Trend (vs prior retro — RETRO-2026-07-02-plan-implementation)
- **PLAN phase:** 1 agent · 148k tok · ~12 min · 0 rework · parallelism 1.0.
- **IMPLEMENT phase (Group C):** 6 agents (4 unmeasured) · ≥225k tok known (review only) · Review parallelism **1.66×** · 1 build-fix + 1 follow-up round · dominant cost was a **restart re-drive**, not agent tokens.
- The PLAN retro's **"inject a shared context pack for /implement"** recommendation is **re-confirmed** — still un-actioned, now with evidence from the review gates. Promote it from recommendation to standing practice.
