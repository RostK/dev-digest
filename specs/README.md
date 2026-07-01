# specs — Spec-Driven Development (SDD) specifications

Feature specs authored **before** planning or coding: they define the **WHAT** (problem,
behavior, acceptance criteria, boundaries), not the **HOW**. The `implementation-planner`
consumes an approved spec and turns it into a file-level plan; implementers build from there.

Specs are authored by the **`spec-author`** agent (it grounds, analyzes, drafts with
`[NEEDS CLARIFICATION]` markers, and is the only writer allowed here) and orchestrated by the
**`/spec-creator`** loop skill (surfaces the agent's open questions to the user via live Q&A and
re-invokes it to resolve them). Run the agent alone for an unattended draft.

## Taxonomy — one subfolder per module
- `specs/server/` — `@devdigest/api` (Fastify/Drizzle) features
- `specs/client/` — `@devdigest/web` UI / flows
- `specs/reviewer-core/` — the pure review engine
- `specs/repo-intel/` — indexing / repo map / blast radius
- `specs/cross/` — features spanning more than one package

## File naming
`SPEC-NN-YYYY-MM-DD-<feature-slug>.md` — global ID, authoring date, kebab-case feature name.
IDs are assigned from `INDEX.md` (next global `SPEC-NN`) and never reused.

## Status lifecycle
`draft` → `approved` → `implemented`. A spec that replaces another sets its own
`Supersedes:` link and flips the old spec to `superseded`. Status is managed by the agent
on your explicit instruction; new specs default to `draft`.

## Approval gate
A spec MUST NOT be set to `approved` while any `[NEEDS CLARIFICATION]` item remains open.
Resolve every open question first, or explicitly defer it (move to Non-goals or a follow-up
spec). A material change to an already-`approved` spec either supersedes it or requires
re-approval; minor edits ride git history.

## Traceability
Acceptance criteria carry stable IDs (`AC-1`, `AC-2`, …), each with a `Verify:` hint. The
`implementation-planner` reuses those IDs in its plan's acceptance criteria and tests reference
them in their names — so `plan-verifier` can trace every requirement forward to code and tests.
Never renumber an `AC` once a spec is `approved`; append `AC-N+1` instead. The authoring rubric
(EARS, INVEST, completeness) lives in the `requirements-engineering` skill.

## Body language
Spec bodies are written in **English**; EARS keywords (`WHEN/WHILE/IF/WHERE/SHALL`) and all
paths/identifiers are verbatim.

## <a name="ears"></a>EARS — how to write acceptance criteria
EARS (Easy Approach to Requirements Syntax) collapses each requirement into one testable
statement with an unambiguous trigger, state, and response. Five patterns:

1. **Ubiquitous** — always true: *The system SHALL log every authentication attempt.*
2. **Event-driven** (`WHEN … SHALL`): *WHEN the user submits the sign-in form, the system SHALL validate the credentials against the auth provider.*
3. **State-driven** (`WHILE … SHALL`): *WHILE a sync is running, the system SHALL show a non-dismissable progress indicator.*
4. **Unwanted behavior** (`IF … THEN … SHALL`): *IF credential validation fails 3 times in 60s, THEN the system SHALL lock the account for 15 minutes.*
5. **Optional feature** (`WHERE … SHALL`): *WHERE MFA is enabled, the system SHALL require a TOTP code after the password.*

Translating vague → testable is the real skill:

| Vague | EARS criterion |
| --- | --- |
| "Should work on big repos" | WHEN the repository exceeds the indexing threshold, the system SHALL generate the overview from deterministic facts only, without full file reads |
| "Shouldn't crash if the model is down" | IF the structured model call fails, THEN the system SHALL render a deterministic overview skeleton with the reason instead of an error |
| "Should hint where to start reading" | The system SHALL order the reading path by file rank from the import graph, not alphabetically or by date |
