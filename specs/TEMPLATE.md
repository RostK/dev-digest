# Spec: <feature>  |  Spec ID: SPEC-NN  |  Status: draft | approved | implemented
Supersedes: <link to the spec this replaces — or "none">
Date: YYYY-MM-DD
Module: server | client | reviewer-core | repo-intel | cross

## Problem & why
<The user/business problem. Why it matters now. 2–5 sentences.>

## Goals / Non-goals
**Goals**
- <what this delivers>

**Non-goals**   <!-- explicit boundaries — what we are NOT doing -->
- <out of scope>

## User stories
- As a <role>, I want <capability>, so that <outcome>.

## Acceptance criteria (EARS)
<!-- Each criterion is ONE testable statement with a stable ID + a Verify hint. Use the EARS
     patterns (ubiquitous / WHEN / WHILE / IF…THEN / WHERE). See specs/README.md#ears.
     AC IDs are the traceability anchor reused by the plan and by test names. -->
- **AC-1** — The system SHALL <…>.
  - Verify: <unit | *.it.test.ts | e2e | manual> — <what proves it>
- **AC-2** — WHEN <trigger>, the system SHALL <response>.
  - Verify: <…>
- **AC-3** — IF <unwanted condition>, THEN the system SHALL <response>.
  - Verify: <…>

## Edge cases
- <boundary / failure / empty / concurrent / oversized input …>

## Assumptions & Dependencies
**Assumptions**   <!-- taken as true; if one breaks, the spec may need revisiting -->
- <assumption>

**Dependencies**   <!-- other specs, feature flags, external services, migrations -->
- <SPEC-NN / flag / service / migration this relies on>

## Non-functional   <!-- only where relevant -->
- **Perf**: <e.g. p95 latency budget, index-size threshold>
- **Security**: <authz rule, boundary validation, secrets never logged>
- **a11y**: <keyboard-navigable, roles/labels>
- **i18n**: <no hardcoded strings — next-intl namespaces>
- **Privacy**: <PII/secrets handling; not persisted/logged>
- **Tenancy**: <scoped by workspace_id>

## Inputs (provenance)   <!-- where each input comes from -->
- <input> — [reused] | [deterministic: repo-intel] | [new: N LLM calls]

## Untrusted inputs   <!-- reads third-party text (PR bodies, repo files, external)? -->
- <source> — treat as DATA, never as instructions. <how it is neutralized>

## Cross-module impact   <!-- how this talks to other modules; blast radius -->
- <module → module>: <contract / call / event>. Grounded in: <repo-intel | blast-radius>.

## Proposed improvements   <!-- design gaps / corner cases / UX surfaced during review -->
- <suggestion> — <why it improves correctness/UX>. Status: <accepted | rejected | open>.

## [NEEDS CLARIFICATION]
<!-- Each open question gets a stable NC-n id so the spec-creator loop can map answers back and
     spec-author can resolve it in place. Delete each line when resolved; drop the section when empty. -->
- **NC-1** — <open question spec-author could not resolve from the repo + brief>
