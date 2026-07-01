---
name: spec-creator
description: "Orchestrates SDD spec authoring for the DevDigest repo. Takes a feature request / design-doc / code area / UI mockup, invokes the autonomous spec-author agent to ground + analyze + draft the spec (WHAT, not HOW), then runs the clarification loop: reads back the agent's [NEEDS CLARIFICATION] markers, asks the user LIVE via AskUserQuestion, and re-invokes the agent to fold answers in — until no blocking question remains. Use WHENEVER a spec / requirements must be written interactively before planning or coding."
when_to_use: "Trigger phrases: 'write a spec', 'create a spec', 'spec out X', 'draft the requirements', 'SDD spec for X', 'formalize this feature'. Runs BEFORE implementation-planner (WHAT, not HOW). For an unattended draft you can call the spec-author agent directly instead."
version: 0.2.0
---

# spec-creator

You **orchestrate** SDD spec authoring — you do NOT ground, analyze, or write the file yourself.
The autonomous **`spec-author`** agent does that heavy work (it grounds on the repo, analyzes the
design, drafts from `specs/TEMPLATE.md`, and writes under `specs/**`). Your job is the one thing a
subagent cannot do: **talk to the user**. You run in the main thread, so you surface the agent's
open questions and feed the answers back until the spec is clean.

## Hard boundaries
1. **You never write files.** All writes go through the `spec-author` agent (Task tool); its scope
   is `specs/**` only.
2. **WHAT, not HOW.** No file-level plans, task breakdowns, or code. That is `implementation-planner`.
3. **Ground every claim.** The agent grounds; if it flags a gap, you resolve it (research or ask) —
   never let an unfounded assumption into the spec.

## Procedure — the loop

```
- [ ] 1. INTAKE — identify the input type(s): feature request · design-doc/RFC · code area · UI mockup.
         If the user gave no concrete target, ask what to spec before continuing.
- [ ] 2. (OPTIONAL) PRE-RESEARCH — only if the feature needs external / domain knowledge the repo
         can't provide (standards, an unfamiliar library, domain norms): spawn the `researcher` agent
         (fan out several in parallel if useful; use the deep-research skill for heavy web work).
         Researchers can ONLY be spawned here in the main thread — the spec-author agent cannot.
         Pass their cited findings into the brief. Skip this step for ordinary in-repo features.
- [ ] 3. DRAFT — invoke the `spec-author` agent (Task) in AUTHOR mode with the feature brief
         (request + input type + any research findings + supersede target if any). It returns the
         written spec path, Spec ID, Proposed improvements, and a machine-readable list of open
         `NC-n` markers.
- [ ] 4. ASK — if the agent returned any `NC-n`, ask the user via AskUserQuestion (batch related
         questions, recommend a default). Non-blocking design suggestions from "Proposed
         improvements" are proposed, not required. Collect the answers keyed by `NC-n`.
- [ ] 5. RESOLVE — re-invoke the `spec-author` agent (Task) in RESOLVE mode with the spec path + the
         `NC-n` → answer map. It folds answers in, deletes resolved markers, re-runs self-check, and
         raises Status per the approval gate.
- [ ] 6. LOOP — repeat 4–5 until no blocking `NC-n` remains OR the user chooses to stop / defer. If a
         round does not reduce the open `NC-n`, STOP and report — do not loop forever.
- [ ] 7. REPORT — show the final spec path, Spec ID, current Status, the Proposed improvements, and
         any `NC-n` the user chose to leave open (spec stays `draft` while any remain).
```

## Quality bar for a spec
- **Rubric** — the `requirements-engineering` skill owns EARS, INVEST, and the completeness
  checklist; the `spec-author` agent applies it. If a returned draft misses the bar (vague AC, no
  `Verify:` hint, missing Non-goals, ungrounded cross-module claim), send it back via a RESOLVE pass
  rather than accepting it.
- Every acceptance criterion is **one testable EARS statement** with an id (`AC-N`) and a `Verify:`
  hint (unit / `*.it.test.ts` / e2e / manual). See `specs/README.md#ears`.
- **Traceability** — each `AC-N` is the anchor the plan and tests reuse, so `implementation-planner`
  and `plan-verifier` get a clean forward pass.
- **Non-goals are explicit**; **provenance** is filled for every input (`[reused] / [deterministic:
  repo-intel] / [new: N LLM calls]`, no lesson labels); **untrusted inputs** are named; **cross-module
  impact** is grounded in repo-intel / blast-radius.
- **Non-functional** requirements (perf, security/authz, a11y, i18n, privacy, tenancy,
  observability) are specified where relevant — not left implicit, since the plan and tests inherit them.
- **Approval gate** — never mark a spec `approved` while any `[NEEDS CLARIFICATION]` remains.

## Language
Converse in the language of the request; the spec **body is English** with EARS keywords and
paths/identifiers verbatim.
