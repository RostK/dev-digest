# Agents

Custom Claude Code subagents for the DevDigest repo. Each agent is a Markdown file with
YAML frontmatter (delegation `description`, `tools` allowlist, `model`, permission/isolation
settings) followed by a system-prompt body. Claude delegates to an agent based on its
`description` — keep those precise.

| Agent | Role | Writes? | Model | Key frontmatter |
|-------|------|---------|-------|-----------------|
| [`researcher`](researcher.md) | Read-only investigator (project + internet) returning a cited, structured report | No | sonnet | `tools: Read, Glob, Grep, Bash, WebSearch, WebFetch` |
| [`implementation-planner`](implementation-planner.md) | Turns existing requirements into an Implementation Plan — verifies requirements, recommends improvements, asks multi- vs single-agent — with parallel-safe task units | No | opus | `permissionMode: plan`, read-only tools + `Skill` + `AskUserQuestion` |
| [`implementer-backend`](implementer-backend.md) | Executes ONE backend task unit (`server/**` or `reviewer-core/**`); runs many-in-parallel | Yes | sonnet | `isolation: worktree`, `permissionMode: acceptEdits`, `skills:` backend set, `+Write, Edit, Skill` |
| [`implementer-ui`](implementer-ui.md) | Executes ONE UI task unit (`client/**`); runs many-in-parallel | Yes | sonnet | `isolation: worktree`, `permissionMode: acceptEdits`, `skills:` ui set, `+Write, Edit, Skill` |
| [`test-writer-backend`](test-writer-backend.md) | Writes backend tests (`server/**`, `reviewer-core/**`); TDD-first or backfill; red→green | Yes (tests) | sonnet | `isolation: worktree`, `permissionMode: acceptEdits`, `skills:` backend-test set |
| [`test-writer-ui`](test-writer-ui.md) | Writes UI tests (`client/**`, RTL/jsdom); TDD-first or backfill; red→green | Yes (tests) | sonnet | `isolation: worktree`, `permissionMode: acceptEdits`, `skills:` ui-test set |
| [`architecture-reviewer`](architecture-reviewer.md) | Read-only architecture review (onion + feature-based); Violation/Smell/Nit, cited | No | sonnet | read-only tools + `Skill`, `skills:` architecture set |
| [`plan-verifier`](plan-verifier.md) | Read-only requirements-coverage check of code vs a plan (traceability, not quality) | No | sonnet | read-only tools + `Skill`, `skills:` light |
| [`doc-writer`](doc-writer.md) | Writes docs (Diátaxis + ADR + Mermaid) to the right repo location, grounded in code | Yes (docs) | sonnet | `permissionMode: acceptEdits`, `skills:` mermaid + architecture |
| [`spec-author`](spec-author.md) | Autonomous SDD author — grounds, analyzes, drafts with `[NEEDS CLARIFICATION]` markers, writes `specs/**` + maintains `specs/INDEX.md`; runs standalone or driven by the `write-spec` loop | Yes (specs only) | opus | `permissionMode: acceptEdits`, write scope `specs/**`, `+mcp__devdigest__get_conventions/get_blast_radius` |

## Model choices

- **`implementation-planner` → opus.** Planning is the highest-leverage step: its decomposition,
  file scoping, and skill/pitfall assignment compound across every downstream worker. Pay
  for reasoning quality once, here.
- **`implementer-backend` / `implementer-ui` → sonnet.** They run many-in-parallel (so cost
  multiplies), execute a well-scoped task the implementation-planner already reasoned through, and are
  backstopped by a hard tests + typecheck gate. Sonnet keeps strong coding ability at
  predictable, low fan-out cost. Not haiku — they write real backend/UI code under
  architectural constraints, and a bad edit across parallel worktrees is costly to untangle.
  If a task is too gnarly for sonnet, that's a signal for the implementation-planner to split it smaller,
  not to upgrade the worker.
- **`researcher` → sonnet.** Synthesis, source-reliability grading, and the no-hallucinated-
  citations honesty rule are exactly where smaller models fail, and there's no downstream
  gate to catch a confident-but-wrong report. It's invoked one-at-a-time (no ×N pressure),
  so there's little to save by going cheaper. Haiku fits only narrow mechanical lookups —
  better served by a dedicated lightweight agent than by downgrading `researcher`.
- **`test-writer-backend` / `test-writer-ui` → sonnet.** Like the implementers: many-in-parallel,
  well-scoped, and backstopped by their own red→green + typecheck gate. The split mirrors the
  implementers so each preloads only its track's test skills (`react-testing-library` for UI;
  Fastify/Drizzle/Vitest conventions for backend).
- **`architecture-reviewer` / `plan-verifier` → sonnet** (currently, for cost). Both are read-only
  judgments with **no downstream gate** and a high cost of being wrong (a false "violation" or a
  confident-but-unmet "verified"), and both run one-at-a-time (no ×N pressure) — the profile that
  originally justified opus. They were **downgraded to sonnet to cut cost**, which the design always
  allowed *"if cost matters and the strict grounding rules in their prompts hold up"*: both prompts
  are heavily grounding-constrained (every finding / `MET` needs an exact `path:line`; a stub is
  never `MET`; `NOT FOUND` must say where it searched), leaving little room to hallucinate a verdict.
  **Revert to opus if you see false `VIOLATION`s or confident-but-unmet `MET`s** — `plan-verifier`
  is the riskier of the two on sonnet, since it is the last acceptance gate.
- **`doc-writer` → sonnet.** Grounded technical writing + diagram generation; not precision-
  critical reasoning, and a human reads the prose. Strong enough to mirror an API or turn a plan
  into a doc faithfully, at predictable cost.
- **`spec-author` → opus.** Authoring requirements is upstream of everything: a vague or
  contradictory acceptance criterion propagates into the plan, the code, and the tests with no
  downstream gate to catch it. This agent now owns the full author job — grounding, design
  analysis, normalizing intent into precise EARS statements, and ID/supersedes bookkeeping — so it
  is exactly the reasoning-critical, one-at-a-time step (no ×N pressure) worth paying for. Sonnet
  is an acceptable downgrade only if it is driven purely as a mechanical renderer of an already-
  final brief.

## How they fit together

Upstream of the plan sits the **spec**: the autonomous **`spec-author`** agent grounds on the repo,
analyzes the design, drafts the spec leaving open decisions as `[NEEDS CLARIFICATION]` markers, and
materializes it as `specs/<module>/SPEC-NN-YYYY-MM-DD-<slug>.md` registered in `specs/INDEX.md`. The
**`write-spec`** skill (main thread) wraps it in a clarification loop — it surfaces those markers
to the user **live** via `AskUserQuestion` and re-invokes the agent to resolve them (a subagent
cannot ask the user itself). Run the agent alone for an unattended draft, or via the skill for the
interactive close-out. The spec is the **WHAT**; `implementation-planner` consumes it and produces
the **HOW**.

`implementation-planner` → produces an Implementation Plan whose task units are tagged `backend|ui`, name
the exact files and skills, quote relevant INSIGHTS pitfalls, and declare which units are
parallel-safe (disjoint file sets). The planner is read-only, so **the main thread persists the
returned plan to `plans/PLAN-<SPEC-ID>-<slug>.md`** (HOW lives in `plans/`, never `specs/`) — a
plan is usually executed in a separate chat and verified in a third, so it must survive as a
durable artifact, not chat scrollback. You then fan out one implementer per task unit —
`implementer-backend` for `backend` units, `implementer-ui` for `ui` units; each works in its
own git worktree, applies its preloaded track skill set, makes the tests green, and
self-reviews only its own diff. Worktree output is **uncommitted in that worktree** — the
orchestrator must integrate each worker's files back into the branch (and commit units that later
units depend on) before the review phase.

Around that core loop sit the test and review specialists. **`test-writer-backend` /
`test-writer-ui`** author tests (TDD-first from the plan's `AC`s — the preferred default — or
backfill for existing code) with a red→green gate. Then **three read-only gates run in parallel**
(fan them out in one message — they are independent):

- **`plan-verifier`** — requirement coverage: was every `AC` actually built (evidence, not
  quality). It reads the plan's `Verify:` hints, which point at **named tests** — so it must run
  **after the tests exist**, never before, or it reports false `NOT FOUND`s.
- **`architecture-reviewer`** — structural topology only (onion / feature-based invariants). It
  does **NOT** hunt bugs.
- **`/code-review`** — line-level correctness bugs (the gap `architecture-reviewer` deliberately
  leaves). Use its `ultra` variant for a deep cloud pass.

Their findings feed a **remediation loop**: route fixes back to `implementer-*`, then re-verify
only the touched items. Finally **`pr-self-review`** gates the whole diff before push/PR.
**`doc-writer`** turns the finished work (or a plan, or any input) into correctly-typed,
correctly-placed documentation with Mermaid diagrams. `researcher` is the read-only fact-finder
used to ground any step (project code or the web).

**End-to-end pipeline** (the parenthesized read-only gates run in parallel):

```
write-spec → spec-author        ──►  APPROVED spec        (WHAT, in specs/)
implementation-planner            ──►  plans/PLAN-*.md       (HOW, persisted by the main thread)
  then, executing the plan:
   1. test-writer-*    red tests from each AC              (TDD-first default)
   2. implementer-*    multi-agent in worktrees → green
                       → integrate worktree output back into the branch
   3. ( plan-verifier ‖ architecture-reviewer ‖ /code-review )   ← parallel, read-only
   4. fix loop:        findings → implementer-* → re-verify touched items
   5. pr-self-review   whole diff → push / PR
```

Three main-thread **skills** drive this pipeline, one per phase — each wraps/drives its agent(s),
keeps user Q&A + the phase gate in the main thread, and offers **`/review-run`** at the end:
- **`/write-spec`** — the SPEC phase; wraps `spec-author`, runs the `[NEEDS CLARIFICATION]` loop.
- **`/plan-implementation`** — the PLAN phase; wraps the read-only `implementation-planner`, relays
  its clarifications via `AskUserQuestion`, fans out `researcher`s for its `[RESEARCH NEEDED]` gaps,
  confirms the execution mode, and **persists the plan to `plans/PLAN-*.md`** (the planner can't write).
- **`/implement`** — build → review → fix → gate from the persisted plan.

Run spec and plan as their own deliberate, human-in-the-loop steps; `/implement` then automates the
tail — fanning out the implementers, running the three review gates in parallel, driving the bounded
post-review fix loop, and stopping at the pre-push gate. (A read-only agent can't prompt the user,
fan out siblings, or write — so each phase's main-thread duties live in its wrapper skill, never in
the agent; that is also why the `/review-run` nudge lives in the skills, not the agents.)

**Current token-economy toggles** (see also `/implement`): the **`test-writer-*`** agents are
**paused** — not invoked — so implementers green only existing/own tests and `plan-verifier` will
report the missing test evidence as `UNVERIFIABLE`/`NOT FOUND` (expected); and
**`architecture-reviewer` / `plan-verifier` run on `sonnet`** (see Model choices). Re-add a
red-tests phase and/or revert those models when cost is less tight.

---

## `researcher`

A read-only investigator that answers a question either from inside the project (files, code,
config, git history) or from the internet, and returns a strictly structured report with
citations — honestly flagging what it could not find. It never writes, edits, or mutates
anything, and is the fact-finder the other agents lean on.

**Based on:**

- **Single responsibility + read-only tool scoping** — project read tools (`Read`, `Glob`,
  `Grep`, read-only `Bash`) plus `WebSearch`/`WebFetch`; no `Write`/`Edit`.
- **Structured output with mandatory citations** so findings are traceable, plus a
  **no-hallucinated-citations honesty rule** (say "not found" rather than guess).
- It **predates** the implementation-planner/implementer work and follows the same conventions; its full
  design is documented inline in `researcher.md`.

**Sources:** none external — its design is self-contained in `researcher.md`.

## `implementation-planner`

A read-only software architect. It takes **already-defined requirements** and produces the HOW
— never the spec. It runs a mandatory pre-step (root + module `CLAUDE.md`, module
`INSIGHTS.md`, README, `git log`), knows the full module map (server modules, `reviewer-core`,
client routes, dual-vendored `@devdigest/shared` contracts), verifies the incoming requirements
(clarifying questions + recommendations), confirms multi- vs single-agent execution with the
user, and emits an Implementation Plan for the implementers. It **invokes** the same per-track
skill set the matching implementer preloads *and* names those skills on each task unit — so the
plan's structure is skill-grounded at plan time, not just at execution time.

**Based on:**

- **`description` as the sole delegation trigger** + supported frontmatter fields + tool
  scoping (allowlist) → read-only `tools` and `permissionMode: plan`, plus `Skill` (read-only:
  it injects guidance, never writes) for full per-track parity with the implementers, and
  `AskUserQuestion` so requirement clarifications and the multi-/single-agent choice are real
  interactive prompts, not prose.
- **Separation of spec from implementation planning** — it consumes requirements and produces
  the HOW (file-level tasks, ordering, skills, pitfalls, test plan); it never authors the spec.
- **Requirements verified at plan time** — it validates the incoming requirements, asks
  clarifying questions, and recommends improvements before committing to a plan.
- **User-chosen execution mode** — it confirms multi-agent (parallel implementers) vs a
  single-agent pass and shapes the plan accordingly (parallelization graph vs ordered steps).
- **Read-heavy planner, write-heavy implementer** division of responsibility.
- **INSIGHTS read at plan time** for *only the touched modules* (never every INSIGHTS in the repo)
  and baked into task specs (context-engineering: inject only load-bearing context), rather than
  every worker re-reading everything.
- **Traceability carried forward** — it reuses the spec's `AC-N` ids verbatim, each with its
  `Verify:` hint, and carries the **non-functional** requirements into the plan so they shape
  design (and `plan-verifier` can trace both forward).
- **Research signalled, never guessed** — a read-only subagent can't spawn `researcher`, so an
  info gap becomes a `[RESEARCH NEEDED: …]` item the main thread resolves by fanning out one or
  more `researcher` agents in parallel (mirrors `spec-author`'s `[NEEDS CLARIFICATION]` handshake).
- **A final self-check** gates the plan before it's emitted (every requirement → a unit, every
  claim cited, unknowns flagged, parallel groups disjoint).
- **Naming away from built-ins** (`plan`/`explore`/`Plan` can be shadowed) → `implementation-planner`.

**Sources:** 1, 2, 5, 6, 10, 11 — see [Sources](#sources).

## `implementer-backend` / `implementer-ui`

Two parallel-safe engineers — one per track — that each execute exactly one planned task
unit. The split exists so each variant **preloads exactly its track's skill set** via the
`skills:` frontmatter (full skill bodies injected at startup) with no cross-track context:
`implementer-backend` covers `server/**` and `reviewer-core/**`; `implementer-ui` covers
`client/**`. Each reads the local module `INSIGHTS.md` (hybrid model), touches only its
assigned files, makes the relevant tests and typecheck pass (the hard gate), and self-reviews
only the code it wrote.

**Based on:**

- **`skills:` frontmatter preload** — the subagent docs confirm listed skills are injected
  (full content, not just the description) into context at startup. Because one file can't
  preload *conditionally*, the agent is split into a backend and a UI variant so each loads
  only its track's set — guaranteed presence without the cross-track context cost (and noise)
  of loading all eleven. The implementation-planner still invokes the same per-track set while planning.
- **Worktree isolation for parallel workers** (`isolation: worktree`) so concurrent edits —
  and concurrent *whole-project* `typecheck`/`test` runs, which are not file-scoped — never
  collide, plus `permissionMode: acceptEdits` for non-interactive runs. See the worktree
  setup note below.
- **File-ownership-up-front**: tasks with overlapping files must be sequenced, not
  parallelized — the worker stays strictly inside its assigned files.
- **~3–5 concurrent workers** as the practical sweet spot before merge cost dominates.
- **Hybrid INSIGHTS consumption**: implementation-planner bakes in the cross-cutting ones; the worker reads
  its own module's local file for freshness. The worker never *writes* INSIGHTS — it surfaces
  candidates in its summary and the parent routes them via `engineering-insights`.
- **Self-review + test-gating loop** scoped to the worker's own diff (not a full PR audit).

**Sources:** 1, 2, 3, 4, 5, 7, 8, 9, 10 — see [Sources](#sources). (Source 1's `skills:`
preload and source 3's worktree isolation are what make the two-variant design possible.)

### Worktree setup — making `node_modules` available (one-time, per environment)

A fresh `git worktree` is a tracked-files-only checkout, so it has **no `node_modules`** —
and this repo has three separate package installs (`server/`, `client/`, `reviewer-core/`,
each its own lockfile). The implementers run `pnpm`/`npm` `test` + `typecheck`, which need
those deps present. Notes:

- **`.worktreeinclude` (repo root, `.gitignore` syntax) COPIES** matched gitignored files
  into each worktree. It's the right tool for small config (`.env`) but **not** for
  `node_modules`: copying three installs per worker is heavy, and pnpm's `node_modules` is a
  symlink farm into a global store that does not copy cleanly. Tests here need no secrets
  (server mocks adapters, reviewer-core stubs the LLM, client mocks `fetch`), so no secrets
  need copying either.
- **Recommended:** symlink/junction each package's `node_modules` into the worktree (instant,
  no duplication) via a one-time worktree-create setup step. On **Windows** symlinks require
  Developer Mode or an elevated shell.
- **Fallback if worktree setup is undesirable:** drop `isolation: worktree` and rely on
  owned-paths alone — only safe when workers run sequentially, across *separate packages*, or
  with the implementation-planner sequencing any units that share a `typecheck`/`test` scope (because those
  gates compile the whole package, a sibling's in-flight edit would otherwise contaminate a
  worker's green/red signal).

## `test-writer-backend` / `test-writer-ui`

Two parallel-safe test authors — one per track, split for the same `skills:`-preload reason as
the implementers (UI preloads `react-testing-library`; backend preloads Fastify/Drizzle +
`onion-architecture` so it tests at the right seam). Each works in two modes: **TDD-first**
(write failing tests from the plan's acceptance criteria, confirm RED, hand off) and **backfill**
(prove a test is alive against existing code, then GREEN). They touch **test files only** and
share the implementers' worktree isolation + `node_modules` setup note above.

**Based on:**

- **A test-writer's value is the red→green self-check** — a test that passes before the behavior
  exists is testing the wrong thing; the agent must witness RED first. Plus behavior-over-
  implementation, RTL query priority (`getByRole` first, `getByTestId` last) + `userEvent`,
  the unit-vs-`*.it.test.ts` split, mock-only-the-outer-boundary, determinism (no `sleep`/random),
  and our `TESTING.md` rule "if a test wouldn't catch a class of regression we care about, we
  don't write it."
- **Scope boundary:** never edits production code, config, or deps — missing behavior becomes a
  reported gap, not a fix. Distinct from the implementers (which green their *own* tests).

**Sources:** backend → 14, 15, 16, 17; ui → 12, 13, 14, 15, 17 — see [Sources](#sources).

## `architecture-reviewer`

A single read-only architect (one agent, not split — review benefits from seeing across the
server/client boundary, e.g. the dual-vendored contracts). It evaluates **structural topology**
like a fitness function and writes nothing.

**Based on:**

- **A what-to-check checklist** for our invariants: inward-dependency rule, ring/layer leakage
  (Drizzle/Fastify types in the core), module-boundary breaches, `@devdigest/shared` contract
  integrity, business-logic placement; UI page-thinness, server/client boundary, feature coupling.
- **Severity tiers `VIOLATION` / `SMELL` / `NIT`** with style/naming explicitly out of scope
  (nits suppressed), every finding grounded in an exact `path:line` import, recurring patterns
  reported once, and a `NOT REVIEWED` section (no false completeness). Distinct from
  `/code-review` (line-level correctness) — this is structure only.

**Sources:** 18, 19, 20, 21, 22, 23 — see [Sources](#sources).

## `plan-verifier`

A read-only requirements verifier. Given an Implementation Plan + the written code, it checks whether
every requirement was actually implemented — **coverage and done-ness, not code quality**.

**Based on:**

- **Requirements-traceability method**: forward pass (each acceptance criterion → evidence),
  DoD pass (per task unit), backward pass (flag gold-plating / unplanned artifacts) — Verification,
  not Validation (it reads artifacts, never runs them).
- **A restricted verdict vocabulary** (`MET` / `PARTIAL` / `NOT FOUND` / `UNPLANNED` /
  `UNVERIFIABLE (static)`) where every `MET` cites a concrete artifact, a stub is never `MET`,
  and `NOT FOUND` must say where it searched — directly countering the confident-but-wrong
  failure mode. Distinct from the architecture-reviewer and `/code-review` (it judges coverage,
  not quality).
- **`Verify:`-hint-driven evidence** — each acceptance criterion's hint tells it the evidence
  class to look for (a named `unit`/`*.it.test.ts`/`e2e` test vs. `manual`), and it verifies
  **non-functional** criteria too (tenancy, i18n, secrets, perf), not just behavioral ones.
- **Folder-scoped INSIGHTS + a final self-check** — it reads only the touched modules' INSIGHTS
  to know their traps, and self-checks (every AC has a verdict, every `MET` cited, nothing
  written) before returning; unresolvable externals are flagged for a `researcher` fan-out.

**Sources:** 24, 25, 26, 27, 28, 29 — see [Sources](#sources).

## `doc-writer`

A technical writer that documents implemented functionality, turns plans into docs, and converts
arbitrary input into structured documents with Mermaid diagrams — choosing the right type and
the right repo location.

**Based on:**

- **Diátaxis** (reference / how-to / explanation / tutorial) + **ADR** for decisions to pick the
  document TYPE, and a **repo-grounded location map** for WHERE it goes (module READMEs; the stub
  `server/docs` · `client/docs` · `e2e/docs` deep-dives; `server/specs` · `client/specs`;
  `docs/agent-prompts`). Follows existing conventions — **no new `docs/adr/`**; decisions route
  through `engineering-insights` into `INSIGHTS.md` (single writer), so doc-writer drafts but
  doesn't hand-append INSIGHTS.
- **Diagrams-as-code** (Mermaid embedded in `.md`, ≤~15 nodes, type-by-situation) and **grounding
  every claim in real code** (quote exact identifiers; mark not-yet-built as "planned"; single
  source of truth), in Google-style prose.

**Sources:** 30, 31, 32, 33, 34, 35 — see [Sources](#sources).

## `spec-author`

The autonomous author of the **Spec-Driven Development** pair. It does the full job end-to-end:
grounds on the repo (module `CLAUDE.md`/README/INSIGHTS, the `get_conventions` / `get_blast_radius`
MCP tools, repo-intel), analyzes the design for gaps / corner cases / cross-module impact / UX,
drafts `specs/TEMPLATE.md` into `specs/<module>/SPEC-NN-YYYY-MM-DD-<slug>.md`, appends the row to
`specs/INDEX.md`, and applies `Supersedes` links. Because a subagent **cannot** ask the user, every
decision it can't resolve becomes a `[NEEDS CLARIFICATION: NC-n]` marker returned for follow-up —
it never guesses to look finished. It runs standalone (an unattended draft) or is driven by the
`write-spec` loop skill, which closes those markers interactively (surface via `AskUserQuestion`
→ re-invoke in **resolve mode** to fold answers in). The split is now **capability-driven**: the
only thing that must live in the main thread is the live Q&A; everything else is autonomous.

**Based on:**

- **Spec-as-contract, WHAT-not-HOW** — the spec defines problem, boundaries (explicit
  Non-goals), and **EARS** acceptance criteria (one testable statement per `AC-N`), sitting
  upstream of `implementation-planner` (which owns the HOW).
- **Autonomous, deferrable clarification** — instead of blocking on the user, the agent emits
  `[NEEDS CLARIFICATION]` markers (forcing Status `draft`) so it can run headless; the `write-spec`
  loop resolves them when a human is present. `AskUserQuestion` is unavailable to subagents, so this
  marker round-trip is what keeps the writer both autonomous and honest.
- **Write-scope isolation** — a dedicated subagent whose sole permitted write target is
  `specs/**` (prompt-enforced), keeping spec authoring from touching source, tests, or config; it
  gets `mcp__devdigest__get_conventions` / `get_blast_radius` explicitly (an explicit `tools:` list
  otherwise excludes MCP tools).
- **A global `SPEC-NN` registry** (`specs/INDEX.md`) as the single source of truth for IDs, with
  a `draft → approved → implemented` lifecycle and explicit supersede links, so specs stay
  traceable as they evolve. Provenance uses `[reused] / [deterministic: repo-intel] / [new: N
  LLM calls]` (no lesson labels).

**Sources:** 1, 6 — see [Sources](#sources) (subagent frontmatter + Spec-Driven Development).

---

## Sources

All nine agents are grounded in the following, gathered via parallel `researcher` runs. Each
agent section above lists its relevant rows under **Sources:** by number; `researcher` itself is
self-contained (see its section). Rows 1–11 ground the implementation-planner/implementers, 12–17 the
test-writers, 18–23 the architecture-reviewer, 24–29 the plan-verifier, and 30–35 the doc-writer.

| # | Title | URL | Used for |
|---|-------|-----|----------|
| 1 | Create custom subagents — Claude Code Docs | https://code.claude.com/docs/en/sub-agents | Frontmatter fields, `description` delegation, tool scoping, permission modes, `skills:` preload (basis for the backend/ui split) |
| 2 | Extend Claude with skills — Claude Code Docs | https://code.claude.com/docs/en/skills | Skill composition, `when_to_use`, progressive disclosure, `context: fork` |
| 3 | Run parallel sessions with worktrees — Claude Code Docs | https://code.claude.com/docs/en/worktrees | `isolation: worktree` for subagents, parallel-edit isolation, `.worktreeinclude` (COPIES gitignored files), per-worktree env setup |
| 4 | Run agents in parallel — Claude Code Docs | https://code.claude.com/docs/en/agents | Orchestrator/worker fan-out |
| 5 | Best practices for Claude Code sub-agents — PubNub | https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/ | Read-heavy planner vs write-heavy implementer, 3–5 worker sweet spot, naming collisions |
| 6 | Spec-Driven Development — Thoughtworks | https://www.thoughtworks.com/en-de/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices | Spec-vs-implementation-planning split; requirements are the input, the plan is the HOW |
| 7 | Git Worktrees for Parallel AI Agent Execution — Augment Code | https://www.augmentcode.com/guides/git-worktrees-parallel-ai-agent-execution | File-ownership-up-front, sequence shared-file tasks |
| 8 | Parallel Agentic Development With Git Worktrees — MindStudio | https://www.mindstudio.ai/blog/parallel-agentic-development-git-worktrees | Worktree-per-worker workflow |
| 9 | Git worktrees for parallel AI coding agents — Upsun Developer | https://developer.upsun.com/posts/ai/git-worktrees-for-parallel-ai-coding-agents | Disjoint-file-set rule for parallelism |
| 10 | Context Engineering in 2025 — mem0.ai | https://mem0.ai/blog/context-engineering-ai-agents-guide | Inject only load-bearing context; plan-time vs exec-time INSIGHTS tradeoff |
| 11 | State of AI Agent Memory 2026 — mem0.ai | https://mem0.ai/blog/state-of-ai-agent-memory-2026 | Agent memory tradeoffs |
| 12 | About Queries — Testing Library | https://testing-library.com/docs/queries/about/ | RTL query priority (`getByRole` first, `getByTestId` last) |
| 13 | React Testing Library FAQ — Testing Library | https://testing-library.com/docs/react-testing-library/faq/ | Behavior-over-implementation, avoid testing internals/snapshots |
| 14 | Write tests. Not too many. Mostly integration. — Kent C. Dodds | https://kentcdodds.com/blog/write-tests | What to test; avoid implementation-detail tests |
| 15 | The Practical Test Pyramid — Martin Fowler | https://martinfowler.com/articles/practical-test-pyramid.html | Unit/integration boundary, mock only the outer parts |
| 16 | Testing — Fastify docs | https://fastify.dev/docs/latest/Guides/Testing/ | `fastify.inject()` route testing (no live server/supertest) |
| 17 | Red/Green TDD — Agentic Engineering Patterns — Simon Willison | https://simonwillison.net/guides/agentic-engineering-patterns/red-green-tdd/ | Witness RED before GREEN; the agentic test loop |
| 18 | Hexagonal Architecture — Alistair Cockburn | https://alistair.cockburn.us/hexagonal-architecture | Ports-and-adapters; inward dependency rule |
| 19 | Explicit Architecture (DDD/Hexagonal/Onion/Clean) — Herberto Graça | https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/ | Layer/ring leakage checklist |
| 20 | Fitness Functions for Your Architecture — InfoQ | https://www.infoq.com/articles/fitness-functions-architecture/ | Architecture as evaluable rules; severity tiers |
| 21 | dependency-cruiser — Rules Reference | https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md | Import-direction / boundary rules to check |
| 22 | ArchUnitTS — Architecture testing for TypeScript | https://github.com/LukasNiessen/ArchUnitTS | Deterministic structural checks before LLM reasoning |
| 23 | Feature-Sliced Design — with Next.js | https://feature-sliced.design/docs/guides/tech/with-nextjs | Frontend feature-layer import rules |
| 24 | Requirements Traceability — Inflectra | https://www.inflectra.com/Ideas/Topic/Requirements-Traceability.aspx | Bidirectional traceability (forward + backward/gold-plating) |
| 25 | Requirements Verification Traceability Matrix (RVTM) — Softacus | https://softacus.com/blog/requirements-verification-traceability-matrix-rvtm | Method + evidence per requirement; "not verified" ≠ failed |
| 26 | IEEE 1012 — System/Software V&V | https://ieeexplore.ieee.org/document/8055462 | Verification vs validation (static, no execution) |
| 27 | Definition of Done — Atlassian | https://www.atlassian.com/agile/project-management/definition-of-done | DoD vs acceptance criteria (independent checklists) |
| 28 | Scope Creep vs Gold Plating — PM Study Circle | https://pmstudycircle.com/scope-creep-vs-gold-plating/ | The backward pass: unplanned/over-built work |
| 29 | When AI Assures Without Evidence — Vectara | https://www.vectara.com/blog/when-ai-assures-without-evidence-lessons-from-deloittes-dollar290k-hallucination | Mandatory citation; never a verdict without an artifact |
| 30 | Diátaxis | https://diataxis.fr/start-here/ | Doc-type taxonomy (tutorial/how-to/reference/explanation) |
| 31 | Documenting Architecture Decisions — Michael Nygard | https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions | Canonical ADR format |
| 32 | Architecture Decision Record — Martin Fowler bliki | https://martinfowler.com/bliki/ArchitectureDecisionRecord.html | ADR usage + `docs/adr/` convention |
| 33 | Docs-as-Code Topologies — passo.uno | https://passo.uno/docs-as-code-topologies/ | Where docs live; colocate vs central; drift prevention |
| 34 | Mermaid — Syntax Reference | https://mermaid.js.org/intro/syntax-reference.html | Diagram-type selection; diagrams-as-code |
| 35 | Google Developer Documentation Style Guide | https://developers.google.com/style | Present tense, active voice, second-person instructions |
