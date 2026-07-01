---
name: implement
description: "Executes an already-approved SDD plan through build → review → fix → gate for the DevDigest repo. Takes a persisted plans/PLAN-*.md (the HOW — produced SEPARATELY via implementation-planner) and optionally its spec, fans out implementer-* per task unit (parallel, worktree-isolated), runs the review gates (plan-verifier + architecture-reviewer + /code-review) in parallel, drives a BOUNDED post-review fix loop, and stops at the pre-push gate. It ORCHESTRATES only — writes no code itself; the main thread owns user Q&A, parallel fan-out, /code-review, and worktree integration. Spec authoring (/write-spec) and planning (implementation-planner) are run manually before this."
when_to_use: "Trigger phrases: '/implement', 'implement the plan', 'execute plans/PLAN-...', 'build from this plan', 'run the SDD implementation'. Requires an existing plans/PLAN-*.md — if there is no plan yet, run implementation-planner first (and /write-spec before that). Explicit, user-invoked: it fans out many workers and writes code, so start it only on request."
version: 0.1.0
---

# implement

You **orchestrate** the implementation tail of Spec-Driven Development: take an **already-approved
plan** and drive it through **build → review → fix → gate**. The upstream steps — the spec
(`/write-spec`) and the plan (`implementation-planner`) — are run **separately, by hand**, before
you. You start from their output.

You run in the **main thread** and **write no code yourself**. Every heavy phase is delegated to a
subagent (Task tool); you own only what a subagent cannot do: **talk to the user**
(`AskUserQuestion`), **fan out parallel subagents**, **run slash commands** (`/code-review`,
`/pr-self-review`), and **integrate worktree output** back into the branch.

**Context hygiene.** Hold only the plan's task units, ids, and the review findings — **never paste
code/diffs in full** into your own context. Let each subagent read files in its own context and
return a short summary.

```
INTAKE (read plans/PLAN-*.md) ─► BUILD (implementer-* ∥, integrate worktrees) ─►
  REVIEW ( plan-verifier ‖ architecture-reviewer ‖ /code-review ) ─► FIX LOOP ─►╴gate╶─►
  pr-self-review ─► report
```

## Current toggles (token economy — read this)
- **`test-writer-*` is PAUSED** — do **not** invoke it. There is no separate red-tests phase.
  Implementers make **existing / their own** tests green; that is the only test bar for now.
  **Consequence:** only an `AC` whose `Verify:` hint names a test nobody wrote comes back
  `UNVERIFIABLE (static)` / `NOT FOUND` from `plan-verifier` — that is **expected**, not a defect.
  `plan-verifier` still earns its keep with the pause on: `manual` / code-presence evidence,
  **non-functional** criteria (authz/tenancy by `workspace_id`, secrets-not-logged, i18n keys),
  **DoD** gates (migration generated, contract updated in both vendor copies), and the
  gold-plating backward pass — none of which depend on tests. Re-enable `test-writer-*` (add a
  red-tests phase before BUILD) to close the test-hinted ACs.
- **`architecture-reviewer` and `plan-verifier` run on `sonnet`** (cost). Their prompts are
  heavily grounding-constrained, so this is a sanctioned downgrade — but if you see false
  `VIOLATION`s or confident-but-unmet `MET`s, flag it (revert those agents to opus).
- **`/code-review` defaults to `medium`** effort here — reserve `ultra` (cloud, expensive) for
  large or high-risk diffs, and only on the user's say-so.

## Hard boundaries
1. **You never write code.** All edits go through `implementer-*`. You orchestrate, ask, and integrate.
2. **A plan is required.** If no `plans/PLAN-*.md` is provided or found, stop and tell the user to
   run `implementation-planner` first (and `/write-spec` before that). Do not invent a plan.
3. **Never proceed on red.** A build wave hands off only when its tests + typecheck are green; a
   worker that returns `blocked` stops that unit until you resolve it.
4. **Bounded fix loop** — stops on convergence, no-progress, or the round cap; never spins forever.
5. **Secrets & do-not-touch** discipline (root `CLAUDE.md`): no secrets in logs/DB/git, no
   hand-edited migrations, no linter, ignore `server/clones/**`.

---

## Phase 0 — INTAKE

1. Resolve the **plan**: the `plans/PLAN-*.md` path the user gave, or the newest one if they say
   "the plan". If none exists, stop (boundary 2). Optionally note the spec it traces (`SPEC-NN`)
   for cross-reference.
2. **Read the plan** (this is your control input): extract the **task units** (files, track,
   skills, DoD, known pitfalls), the **parallelization graph**, the **acceptance criteria**
   (`AC-N` + `Verify:` hints), and the **non-functional** requirements. Keep this structure; you
   pass each worker only **its own unit**, not the whole plan.
3. State in one line: plan path, number of task units, waves, and that spec/plan were done
   separately. Then begin.

## Phase 1 — BUILD

Fan out **`implementer-backend` / `implementer-ui`**, one per task unit, following the plan's
parallelization graph:

- Same wave only for units with **disjoint file sets**; sequence shared-file units; **≤3–5
  concurrent** workers.
- Give each worker **only its task unit** (files, DoD, named skills, quoted INSIGHTS pitfalls).
  `implementer-backend` for `server/**` · `reviewer-core/**`; `implementer-ui` for `client/**`.
- Each runs in its own worktree, touches only its named files, and greens its tests + typecheck
  (the hard gate — `test-writer` is paused, so this is the test bar).
- **INTEGRATE after each wave:** worker output is **uncommitted in its worktree** — collect each
  worker's changed files back into the working branch, and **commit** units that later waves
  depend on (see the worktree note in `.claude/agents/README.md` and project memory). A later
  wave must build on the integrated result.
- Read each summary: **files changed**, **out-of-scope needs**, **insight candidates**,
  **blockers**. An out-of-scope need or a blocker → re-dispatch (adjusted unit) or escalate to the
  user; never let a worker silently expand scope. Route insight candidates through
  `/engineering-insights` at the end (single writer).

## Phase 2 — REVIEW  (three read-only gates, in PARALLEL)

Fan out in **one message** — they are independent:

- **`plan-verifier`** (Task, sonnet) — plan path + built code. Requirement coverage: is every `AC`
  actually implemented (evidence, not quality). Expect `UNVERIFIABLE`/`NOT FOUND` on ACs whose
  test evidence a paused `test-writer` would have produced.
- **`architecture-reviewer`** (Task, sonnet) — structural topology only (onion / feature-based
  invariants). It does **not** hunt bugs.
- **`/code-review`** (Skill, `medium`) — line-level correctness bugs, the gap architecture-reviewer
  leaves. Scope to the branch diff; `ultra` only for large/risky diffs on the user's say-so.

Collect the three reports by reference.

## Phase 3 — FIX LOOP  (bounded — the post-review iterations)

1. **Aggregate & dedup** findings across the three gates (same `file:line` once).
2. **Triage:**
   - **Blocking** = architecture `VIOLATION` + `/code-review` high-confidence bug + `plan-verifier`
     `NOT FOUND`/`PARTIAL` on a required `AC`/DoD (excluding the expected test-evidence gaps above).
   - **Discuss** = `SMELL` / `UNPLANNED` / low-confidence / nit → surface to the user; don't auto-fix.
3. **Escalate plan/spec defects.** If a finding shows the **plan or spec** was wrong (not just the
   code), stop and take it to the user — it needs a re-plan (`implementation-planner`) or a spec
   amendment (`/write-spec`), run separately, not a blind code patch.
4. **Dispatch fixes.** Send each blocking finding to the matching `implementer-*`, scoped to the
   finding's files, in a worktree; it must keep tests + typecheck green. A `plan-verifier`
   `NOT FOUND` may need a small new task unit (missing behavior), not just an edit. **Integrate**
   as in Phase 1.
5. **Re-verify narrowly.** Re-run only the gate(s) whose findings you addressed, scoped to the
   touched files/`AC`s — not the whole review again.
6. **Convergence guard.** Repeat until **no blocking finding remains**, OR a round makes **no
   progress** (report and stop), OR the **round cap (default 3)** is hit. Each round, report what
   was fixed and what remains, and ask the user: keep iterating / accept-with-gaps / stop. Never
   loop silently or forever.

## Phase 4 — GATE & REPORT

- **`/pr-self-review`** (Skill) over the whole diff — the pre-push gate; it blocks on any critical.
- **◆ GATE — ship decision.** Ask the user (`AskUserQuestion`) whether to push / open a PR, or
  hold. Only run git-outbound commands on explicit confirmation.
- *(Optional)* offer **`doc-writer`** (Task) to document the feature from the finished work / plan.
- **Final report:** plan path (+ traced `SPEC-NN`) · files changed · test results · review verdicts
  **before → after** the fix loop · remaining accepted gaps (including the expected test-evidence
  ones) · branch state (ready to push / PR, or blocked and why).
- *(Optional)* offer **`/review-run`** to capture a retrospective of THIS run (agents, tokens,
  what was hard / duplicated / missed, recommendations) — run it now, while the per-agent telemetry
  is still fresh in context, before it scrolls out.

---

## Interaction points (all `AskUserQuestion`, main-thread only)
Each fix-loop round decision (Phase 3) · the ship decision (Phase 4). Everything else runs
delegated and unattended. (Spec/plan clarifications happened earlier, in the separate
`/write-spec` and `implementation-planner` steps.)

## Parallelism rules
Independent subagents go in **one message**: same-wave implementers (Phase 1), the three review
gates (Phase 2). Respect disjoint-file-sets and the ≤3–5-worker ceiling; sequence anything that
shares files or depends on a prior wave's committed result.

## Guardrails & honesty
- If a precondition isn't met (no plan, red tests, un-integrated worktrees), **stop and say so**.
- Report subagent blockers verbatim; never mark a gate passed on assumption.
- The plan (`plans/PLAN-*.md`) stays the single source of truth for the HOW across phases/chats.

## Language
Converse in the language of the request; keep agent/skill names, paths, and commands verbatim.
