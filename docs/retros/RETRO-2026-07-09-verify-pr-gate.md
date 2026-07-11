# Workflow Retro — verify + pr-self-review gate (SPEC-06) · 2026-07-09
Scope: post-implementation VERIFY (plan coverage) + PR-gate (pr-self-review fan-out) + main-thread runtime verification, fix, and a main-into-branch merge integration. Source: in-context task-notification `<usage>` blocks (firm — no nesting) · in/out split + cache-read **not exposed** by this session's usage blocks → those cells `unknown`.

## Run summary
| # | Agent (label) | Phase | Model | Status | Tokens (in/out) | Cache-hit | Tool-uses | Duration | Note |
|---|---------------|-------|-------|--------|-----------------|-----------|-----------|----------|------|
| 1 | plan-verifier (SPEC-06 coverage) | Verify | opus | completed | unknown/unknown (171,502 total) | unknown | 55 | 4.58 min | full 25-AC traceability pass over server+client; found AC-19 parity-test gap; **could not** catch the AC-7 runtime bug (read-only) |
| 2 | general-purpose (server bucket) | PR gate | opus | completed | unknown/unknown (110,653 total) | unknown | 22 | 3.17 min | ran in parallel with #3; 0 criticals; flagged unbounded/undeduped `agent_ids` (medium) |
| 3 | general-purpose (client bucket) | PR gate | opus | completed | unknown/unknown (102,346 total) | unknown | 36 | 2.88 min | ran in parallel with #2; 0 criticals; confirmed XSS-safe untrusted-text render + i18n keys |

Main-thread work (no agents launched): the AC-7 concurrency investigation + fix + test hardening, running the live stack, and the `origin/main` (evals SPEC-05) merge integration — all done inline.

## Metrics
- Agents: **3 launched (3 productive · 0 wasted/retried)** · Fix-loop rounds: **0 agent-driven** (the AC-7 fix loop was main-thread by choice)
- Tokens: **384,501 total** subagent (Verify 171,502 · PR-gate 212,999); in/out split `unknown`; all opus tier
- Cache-hit: **unknown** (usage blocks exposed only a single total per agent, no cache-read)
- Tool-calls: **113** (55 + 22 + 36)
- Wall-clock ≈ **7.76 min** vs sum-of-agent-time **10.63 min** → overall **∥ 1.37×**; the PR-gate pair alone ran **∥ 1.91×** (parallel, near-balanced: 3.17 vs 2.88 min)
- Failures/retries: **none** · Rework traced to: **code** (AC-7 concurrency, cold-intent serialization) — caught by runtime it.test, NOT by any agent

## What went well / hard
- **Hard: plan-verifier** — the heaviest launch (171k tokens, 55 tool-uses, 4.6 min); justified by a 25-AC pass across the whole feature, but see the duplication finding.
- **Easy/clean: the PR-gate pair** — well-balanced server/client split (110k/102k, ~3 min each), near-zero idle on the barrier, 0 criticals, no re-dispatch.
- **Launch discipline: clean** — 0 wasted/killed/duplicate launches (contrast the SPEC-04 plan's ~31% waste).

## Duplicated context (redundant grounding)
- The SPEC-06 **feature source was read ~2×**: plan-verifier read `service.ts`/`helpers.ts`/`routes.ts`/`repository.ts`/schema/contracts/components for AC coverage; the two PR-gate agents then **re-read the same server + client files** against their skill rubrics. Server files: plan-verifier ∩ gate-server. Client files: plan-verifier ∩ gate-client.
- The **main thread had already read** most of these (`service.ts`, `run-executor.ts`, `intent-service.ts`, `repository.ts`, schema, plan, spec) during the AC-7 investigation — then all three agents re-grounded from scratch.
- Both PR-gate agents independently loaded overlapping skills (`security`, `zod`, `typescript-expert`) and each re-derived the diff / file list.
- → Fifth confirmation of `parallel-gate-agents-share-context-pack`: inject ONE shared pack (integrated diff + key-file list + already-read contents) instead of N agents re-reading.

## Missed / rework
- **The AC-7 runtime concurrency bug slipped every static check** — the plan-verifier (this session) *and* the prior session's review gates *and* all unit tests passed it; it only surfaced when the real DB-backed `it.test` ran. A read-only verifier **structurally cannot** catch an execution-time defect.
- **Findings surfaced late that belong earlier**: AC-19 (no automated dual-vendor parity test) open since T1; unbounded/undeduped `agent_ids` (medium) surfaced only at PR-gate — a spec/plan-phase input-bound miss.
- No agent re-dispatch or duplicate launch this run.

## Recommendations (highest-leverage first)
1. **Shared context pack for the pr-self-review fan-out** — gather the diff + key-file list + main-thread-read contents ONCE, inject into both bucket agents. Removes the largest redundancy (feature re-read 2×). Est. saving: a meaningful fraction of the 213k gate tokens.
2. **A verify phase must EXECUTE, not just trace** — pair the read-only plan-verifier with a runtime step (run the `*.it.test.ts` / drive the app). AC-7 proves static traceability + mocked gates give false green; the it.test was the only thing that caught it. (Reinforces `verify-real-functionality-not-mocks`.)
3. **Bake recurring late findings as plan/spec defaults** — `agent_ids.max()` + dedup, and the dual-vendor parity test, should be standing defaults so they aren't discovered at the gate.
4. **Capture cache-hit next run** — this session's `<usage>` gave only a total (no in/out/cache-read); run deep-mode journal parsing to recover the L08 cache-hit signal. Marked `unknown` here.
5. **Keep small fixes in the main thread** — the AC-7 fix loop (investigation + fix + test hardening) stayed inline with 0 wasted agent launches; correct call for a ~4-line fix.

## Trend (from ledger.md)
- **First verify/gate-only run in the ledger** — prior rows are write-spec / plan / implement; this is a lighter, post-build shape (3 agents, 384k tokens) vs the wide implement fan-outs (7 → 22 agents, 721k → 2.54M).
- **Zero-waste streak continues** — 0 wasted launches, matching the SPEC-05 runs (2026-07-06) and reversing the earlier plan-phase waste.
- **Parallelism 1.37× overall / 1.91× for the gate pair** — in line with prior 1.43–1.66×.
- **Cache-hit still `?`** — unbroken across every ledger row; deep mode has never been run. Standing gap.
