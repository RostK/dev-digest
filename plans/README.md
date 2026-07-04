# plans — Implementation Plans (the HOW)

Implementation Plans produced by the `implementation-planner` agent. Where `specs/` holds the
**WHAT** (problem, behavior, acceptance criteria, boundaries), `plans/` holds the **HOW** — the
file-level plan an `implementer-*` fleet executes: which files change, in what order, with which
skills and INSIGHTS pitfalls, and which task units are parallel-safe.

## Why persist a plan
The planner is read-only and cannot save its own output. A plan is typically **produced in one
chat, executed in another, and verified in a third** (`plan-verifier` traces the code against it),
so it must survive as a durable artifact rather than chat scrollback. After the planner returns,
the main thread saves the plan here **before** fanning out implementers.

## File naming
`PLAN-<SPEC-ID>-<slug>.md` — reuse the spec's `SPEC-NN` id and slug so plan ↔ spec ↔ code stay
traceable (e.g. `PLAN-SPEC-01-pr-blast-radius.md`). A plan with no spec (ad-hoc feature) may use
`PLAN-YYYY-MM-DD-<slug>.md`.

## Relationship to `specs/`
- `specs/` = **WHAT** — the contract, approved before planning. Never put HOW here.
- `plans/` = **HOW** — the file-level plan. Reuses the spec's `AC-N` ids **verbatim** for traceability.
- Both feed `plan-verifier`: it checks the code implements every `AC` the plan carried forward.

## Status
A plan is a working artifact, not a contract: it tracks the spec it implements and is superseded
by re-planning rather than versioned formally. When a plan is fully implemented and accepted,
the source of truth moves to the code + tests; keep the plan for traceability, not as live docs.
