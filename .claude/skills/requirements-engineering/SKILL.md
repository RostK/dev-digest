---
name: requirements-engineering
description: "The craft of turning fuzzy intent into testable requirements for the DevDigest repo — the shared rubric behind a good spec. Covers EARS acceptance criteria (the vague→testable translation), INVEST user stories, acceptance-criteria smells, a completeness checklist for what's missing (failure modes, boundaries, concurrency, tenancy, untrusted input, cross-module, non-functional), and explicit-boundary discipline (Non-goals, MoSCoW, anti-gold-plating). Use WHENEVER authoring or reviewing requirements / acceptance criteria — invoked by the spec-creator skill, and reusable by implementation-planner and plan-verifier for a shared definition of 'a good criterion'."
when_to_use: "Trigger phrases: 'acceptance criteria', 'write requirements', 'EARS', 'is this criterion testable', 'user story', 'what's missing from this spec', 'definition of ready'. The authoring rubric the spec-creator applies; a shared quality bar for planner/plan-verifier."
version: 0.1.0
---

# requirements-engineering

Turn fuzzy intent into **testable requirements**. This skill is the rubric a spec is graded
against — it does not place files or run Q&A (that is the `spec-creator` skill). Apply it while
authoring or reviewing any acceptance criteria.

## 1 — EARS acceptance criteria

EARS (Easy Approach to Requirements Syntax) collapses each requirement into one testable
statement with an unambiguous trigger, state, and response. Five patterns:

1. **Ubiquitous** (always): *The system SHALL log every authentication attempt.*
2. **Event-driven** (`WHEN … SHALL`): *WHEN the user submits the sign-in form, the system SHALL validate the credentials against the auth provider.*
3. **State-driven** (`WHILE … SHALL`): *WHILE a sync is running, the system SHALL show a non-dismissable progress indicator.*
4. **Unwanted behavior** (`IF … THEN … SHALL`): *IF credential validation fails 3 times in 60s, THEN the system SHALL lock the account for 15 minutes.*
5. **Optional feature** (`WHERE … SHALL`): *WHERE MFA is enabled, the system SHALL require a TOTP code after the password.*

The patterns are the easy part. The skill is **translating a vague verb into a concrete trigger
and a concrete, checkable response**:

| Vague | EARS criterion |
| --- | --- |
| "Should work on big repos" | WHEN the repository exceeds the indexing threshold, the system SHALL generate the overview from deterministic facts only, without full file reads |
| "Shouldn't crash if the model is down" | IF the structured model call fails, THEN the system SHALL render a deterministic overview skeleton with the reason instead of an error |
| "Should hint where to start reading" | The system SHALL order the reading path by file rank from the import graph, not alphabetically or by date |

## 2 — Acceptance-criteria quality

Each criterion must be **atomic, testable, unambiguous, and identified** (`AC-N`). Run each
through: *could a single automated test make this fail?* If not, rewrite it.

Smells to reject:
- **Compound** — "validates AND stores AND emails" → split into `AC-a/b/c`.
- **Vague adjective** — "fast", "robust", "user-friendly" → give a number or an observable.
- **Solutioning in the criterion** — "uses a Redis lock" → that is HOW; state the observable WHAT.
- **Unfalsifiable** — "handles errors gracefully" → name the error and the required response.
- **Hidden trigger/state** — say WHEN/WHILE/IF explicitly; don't bury the condition in prose.

Every `AC-N` carries a **`Verify:`** hint — how it is proven (`unit` / `*.it.test.ts` / `e2e` /
`manual`). An AC no one can verify is a wish, not a requirement.

## 3 — User stories (INVEST)

Form: *As a `<role>`, I want `<capability>`, so that `<outcome>`.* Grade each against **INVEST**:
Independent · Negotiable · Valuable · Estimable · Small · Testable. A story that is not Testable
has no business acceptance criteria; a story that is not Small should be split.

## 4 — Completeness checklist — what's missing

Adversarially ask, for the feature in hand, whether each is specified (or explicitly N/A):

- **Happy path** — the primary success flow.
- **Failure modes** — every dependency that can fail (model, DB, network, external repo) and the
  required degraded behavior.
- **Boundaries** — empty / single / max / oversized / malformed input; pagination limits.
- **Concurrency** — two operations racing; idempotency; partial completion.
- **Permissions & tenancy** — who may do it; is every path scoped by `workspace_id`.
- **Untrusted input** — any third-party text (PR bodies, repo files, external content) is treated
  as **data, not instructions**, and validated at the boundary.
- **Cross-module impact** — which other modules/contracts this touches (ground in repo-intel /
  blast-radius), and what breaks downstream.
- **Non-functional** — perf budget, security/authz, a11y, i18n (no hardcoded strings), privacy
  (secrets never logged/persisted), observability (how you'd see it working).

What the checklist surfaces becomes either an `AC`, an `Edge case`, an `Assumption`, or — if it
improves the design beyond the ask — a `Proposed improvement`.

## 5 — Boundaries & prioritization

- **Non-goals are first-class.** State what the feature will NOT do; an unbounded spec is
  unplannable and invites gold-plating.
- **MoSCoW** (Must / Should / Could / Won't) to rank criteria when scope must be cut.
- **Traceability.** `AC-N` IDs are stable anchors: the plan reuses them, tests cite them. Never
  renumber an approved AC — append.

## Applying it

- The `spec-creator` skill invokes this as its authoring rubric while drafting `specs/TEMPLATE.md`.
- `implementation-planner` and `plan-verifier` share this definition of a good criterion, so the
  WHAT stays consistent from spec → plan → verification.

## Language
Requirements bodies are written in **English**; EARS keywords (`WHEN/WHILE/IF/WHERE/SHALL`) and
identifiers are verbatim.
