# Agents

Custom Claude Code subagents for the DevDigest repo. Each agent is a Markdown file with
YAML frontmatter (delegation `description`, `tools` allowlist, `model`, permission/isolation
settings) followed by a system-prompt body. Claude delegates to an agent based on its
`description` — keep those precise.

| Agent | Role | Writes? | Model | Key frontmatter |
|-------|------|---------|-------|-----------------|
| [`researcher`](researcher.md) | Read-only investigator (project + internet) returning a cited, structured report | No | sonnet | `tools: Read, Glob, Grep, Bash, WebSearch, WebFetch` |
| [`planner`](planner.md) | Authors a structured, project-aware Development Plan with parallel-safe task units | No | opus | `permissionMode: plan`, read-only tools + `Skill` |
| [`implementer-backend`](implementer-backend.md) | Executes ONE backend task unit (`server/**` or `reviewer-core/**`); runs many-in-parallel | Yes | sonnet | `isolation: worktree`, `permissionMode: acceptEdits`, `skills:` backend set, `+Write, Edit, Skill` |
| [`implementer-ui`](implementer-ui.md) | Executes ONE UI task unit (`client/**`); runs many-in-parallel | Yes | sonnet | `isolation: worktree`, `permissionMode: acceptEdits`, `skills:` ui set, `+Write, Edit, Skill` |
| [`test-writer-backend`](test-writer-backend.md) | Writes backend tests (`server/**`, `reviewer-core/**`); TDD-first or backfill; red→green | Yes (tests) | sonnet | `isolation: worktree`, `permissionMode: acceptEdits`, `skills:` backend-test set |
| [`test-writer-ui`](test-writer-ui.md) | Writes UI tests (`client/**`, RTL/jsdom); TDD-first or backfill; red→green | Yes (tests) | sonnet | `isolation: worktree`, `permissionMode: acceptEdits`, `skills:` ui-test set |
| [`architecture-reviewer`](architecture-reviewer.md) | Read-only architecture review (onion + feature-based); Violation/Smell/Nit, cited | No | opus | read-only tools + `Skill`, `skills:` architecture set |
| [`plan-verifier`](plan-verifier.md) | Read-only requirements-coverage check of code vs a plan (traceability, not quality) | No | opus | read-only tools + `Skill`, `skills:` light |
| [`doc-writer`](doc-writer.md) | Writes docs (Diátaxis + ADR + Mermaid) to the right repo location, grounded in code | Yes (docs) | sonnet | `permissionMode: acceptEdits`, `skills:` mermaid + architecture |

## Model choices

- **`planner` → opus.** Planning is the highest-leverage step: its decomposition,
  file scoping, and skill/pitfall assignment compound across every downstream worker. Pay
  for reasoning quality once, here.
- **`implementer-backend` / `implementer-ui` → sonnet.** They run many-in-parallel (so cost
  multiplies), execute a well-scoped task the planner already reasoned through, and are
  backstopped by a hard tests + typecheck gate. Sonnet keeps strong coding ability at
  predictable, low fan-out cost. Not haiku — they write real backend/UI code under
  architectural constraints, and a bad edit across parallel worktrees is costly to untangle.
  If a task is too gnarly for sonnet, that's a signal for the planner to split it smaller,
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
- **`architecture-reviewer` / `plan-verifier` → opus.** Both are read-only judgments with **no
  downstream gate** and a high cost of being wrong (a false "violation" or a confident-but-unmet
  "verified"), and both are invoked one-at-a-time (no ×N pressure) — exactly the profile where
  paying for reasoning quality and low false positives is worth it. Sonnet is an acceptable
  downgrade if cost matters and the strict grounding rules in their prompts hold up.
- **`doc-writer` → sonnet.** Grounded technical writing + diagram generation; not precision-
  critical reasoning, and a human reads the prose. Strong enough to mirror an API or turn a plan
  into a doc faithfully, at predictable cost.

## How they fit together

`planner` → produces a Development Plan whose task units are tagged `backend|ui`, name
the exact files and skills, quote relevant INSIGHTS pitfalls, and declare which units are
parallel-safe (disjoint file sets). You then fan out one implementer per task unit —
`implementer-backend` for `backend` units, `implementer-ui` for `ui` units; each works in its
own git worktree, applies its preloaded track skill set, makes the tests green, and
self-reviews only its own diff.

Around that core loop sit four more specialists: **`test-writer-backend` / `test-writer-ui`**
author tests (TDD-first from the plan, or backfill for existing code) with the same red→green
gate; **`architecture-reviewer`** and **`plan-verifier`** are read-only gates over the result —
the first judges structural topology (onion/feature-based invariants), the second checks that
every requirement in the plan was actually implemented (coverage, not quality); **`doc-writer`**
turns the finished work (or a plan, or any input) into correctly-typed, correctly-placed
documentation with Mermaid diagrams. `researcher` is the read-only fact-finder used to ground
any step (project code or the web).

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
- It **predates** the planner/implementer work and follows the same conventions; its full
  design is documented inline in `researcher.md`.

**Sources:** none external — its design is self-contained in `researcher.md`.

## `planner`

A read-only software architect. It runs a mandatory pre-step (root + module `CLAUDE.md`,
module `INSIGHTS.md`, README, `git log`), knows the full module map (server modules,
`reviewer-core`, client routes, dual-vendored `@devdigest/shared` contracts), and emits a
Development Plan as a contract for the implementers. It **invokes** the same per-track skill
set the matching implementer preloads *and* names those skills on each task unit — so the
plan's structure is skill-grounded at plan time, not just at execution time.

**Based on:**

- **`description` as the sole delegation trigger** + supported frontmatter fields + tool
  scoping (allowlist) → read-only `tools` and `permissionMode: plan`, plus `Skill` (read-only:
  it injects guidance, never writes) for full per-track parity with the implementers.
- **Separation of planning from implementation** and a **spec-as-contract** (acceptance
  criteria, contracts, invariants, file-level tasks, test plan) rather than a loose PRD.
- **Read-heavy planner, write-heavy implementer** division of responsibility.
- **INSIGHTS read at plan time** and baked into task specs (context-engineering: inject only
  load-bearing context), rather than every worker re-reading everything.
- **Naming away from built-ins** (`plan`/`explore` can be shadowed) → `planner`.

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
  of loading all eleven. The planner still invokes the same per-track set while planning.
- **Worktree isolation for parallel workers** (`isolation: worktree`) so concurrent edits —
  and concurrent *whole-project* `typecheck`/`test` runs, which are not file-scoped — never
  collide, plus `permissionMode: acceptEdits` for non-interactive runs. See the worktree
  setup note below.
- **File-ownership-up-front**: tasks with overlapping files must be sequenced, not
  parallelized — the worker stays strictly inside its assigned files.
- **~3–5 concurrent workers** as the practical sweet spot before merge cost dominates.
- **Hybrid INSIGHTS consumption**: planner bakes in the cross-cutting ones; the worker reads
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
  with the planner sequencing any units that share a `typecheck`/`test` scope (because those
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

A read-only requirements verifier. Given a Development Plan + the written code, it checks whether
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

---

## Sources

All nine agents are grounded in the following, gathered via parallel `researcher` runs. Each
agent section above lists its relevant rows under **Sources:** by number; `researcher` itself is
self-contained (see its section). Rows 1–11 ground the planner/implementers, 12–17 the
test-writers, 18–23 the architecture-reviewer, 24–29 the plan-verifier, and 30–35 the doc-writer.

| # | Title | URL | Used for |
|---|-------|-----|----------|
| 1 | Create custom subagents — Claude Code Docs | https://code.claude.com/docs/en/sub-agents | Frontmatter fields, `description` delegation, tool scoping, permission modes, `skills:` preload (basis for the backend/ui split) |
| 2 | Extend Claude with skills — Claude Code Docs | https://code.claude.com/docs/en/skills | Skill composition, `when_to_use`, progressive disclosure, `context: fork` |
| 3 | Run parallel sessions with worktrees — Claude Code Docs | https://code.claude.com/docs/en/worktrees | `isolation: worktree` for subagents, parallel-edit isolation, `.worktreeinclude` (COPIES gitignored files), per-worktree env setup |
| 4 | Run agents in parallel — Claude Code Docs | https://code.claude.com/docs/en/agents | Orchestrator/worker fan-out |
| 5 | Best practices for Claude Code sub-agents — PubNub | https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/ | Read-heavy planner vs write-heavy implementer, 3–5 worker sweet spot, naming collisions |
| 6 | Spec-Driven Development — Thoughtworks | https://www.thoughtworks.com/en-de/insights/blog/agile-engineering-practices/spec-driven-development-unpacking-2025-new-engineering-practices | Planning/implementation split, spec-as-contract content |
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
