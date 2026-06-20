---
name: pr-self-review
description: "Local pre-PR self-review gate for the DevDigest repo. Before any GitHub-outbound git command (git push / gh pr create / gh pr merge) or on demand, it reviews the current diff by routing each changed file to the matching project skills — UI files through the frontend skills (frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library), backend & domain files through the backend skills (onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design), and zod / typescript-expert / security across both — assigns each finding a severity, and BLOCKS the push/PR when any critical is found. Use this skill WHENEVER about to push a branch, open or update a pull request, or when asked to self-review, pre-flight, or sanity-check local changes before they leave the machine — even if the word 'review' isn't used."
when_to_use: "Trigger phrases: 'self-review', 'review my changes before I push', 'pre-PR check', 'pre-flight the diff', 'is this branch ready to push', 'run pr-self-review', 'check the diff against our skills', 'gate the PR'. Also fires automatically when a git push / gh pr create / gh pr merge is attempted with an un-reviewed, stale, or critical-blocked diff."
version: 1.0.0
---

# PR Self-Review

Catch problems **locally, before code leaves the machine**. This skill reviews the current
diff by reusing the project's *own* skills as the review rubric — each changed file is routed
to the skills that govern its layer — then **blocks the push / PR when any critical is found**.

It does not contain review rules of its own. It is an **orchestrator**: it classifies the diff
and runs the existing skills against the files they own. Edit a routed skill and this review
sharpens for free.

## When it runs

- **Automatically** — a `PreToolUse` hook (`hooks/pr-gate.mjs`) intercepts `git push`,
  `gh pr create`, and `gh pr merge`. If the current diff is un-reviewed, stale, or had a
  critical, the hook **denies** the command and asks Claude to run this skill first. A hook
  can't invoke a skill — it injects the instruction; you act on it, then retry the command.
- **Manually** — `/pr-self-review` at any time to pre-flight the branch.

## Review scope

The diff that would become / update the PR, plus everything still open locally:

- committed branch changes: `git diff main...HEAD`
- working tree: `git diff HEAD` (staged + unstaged)
- untracked files: `git ls-files --others --exclude-standard`

Treat new files as fully in scope (read them whole), not just their diff hunks.

## File → skill routing

Classify **every changed file** by path; a file can land in several buckets (review it under
each). Full globs + rationale in **[references/skill-routing.md](references/skill-routing.md)**.

| Changed path | Bucket | Skills to run as the rubric |
|---|---|---|
| `client/**/*.{ts,tsx}` | UI | frontend-ui-architecture, react-best-practices, next-best-practices, typescript-expert |
| `client/**/*.test.{ts,tsx}`, `e2e/**` | UI tests | react-testing-library *(+ UI above)* |
| `server/src/modules/**/routes.ts`, `server/src/platform/**` | Backend HTTP | fastify-best-practices, onion-architecture |
| `server/src/modules/**/{service,repository}*.ts`, `**/repository/**` | Backend app/data | onion-architecture, drizzle-orm-patterns |
| `server/src/db/schema*/**`, `server/src/db/migrations/**` | DB | postgresql-table-design, drizzle-orm-patterns |
| `server/src/vendor/shared/**`, `**/contracts/**`, any `z.object` | Contracts | zod, onion-architecture |
| `reviewer-core/**` | Pure engine | onion-architecture *(purity)*, typescript-expert |
| **any** file touching auth / secrets / user input / uploads / an endpoint | Cross-cutting | security |

`mermaid-diagram` and `engineering-insights` are **intentionally excluded** — they are not
review rubrics.

## Severity & the critical gate

Only **critical** blocks; high / medium / low are reported but pass the gate. The full rubric
and the exact critical list are in **[references/severity-rubric.md](references/severity-rubric.md)**.
Critical = ships broken or unsafe behavior, e.g. a leaked secret, a missing-authz / injectable
endpoint, a Drizzle query not scoped by `workspace_id`, a hand-edited or destructive migration,
a forked `vendor/shared` contract, dropped boundary validation, or `reviewer-core` importing
from `server/`.

## Procedure

When invoked, copy this checklist and work through it:

```
- [ ] 1. Compute the review scope (above) and list every changed file.
- [ ] 2. Classify each file into buckets via references/skill-routing.md.
- [ ] 3. For each NON-EMPTY bucket, spawn a subagent (Task) that invokes the bucket's
         skills and reviews ONLY that bucket's files against them. Run buckets in
         parallel. Each returns findings: [{ file, line, severity, skill, title, why, fix }].
         (Small diff / one bucket → review inline instead of fanning out.)
- [ ] 4. Merge findings; dedup the same issue reported by two skills; apply the severity
         rubric. Count criticals.
- [ ] 5. Record the verdict so the gate can read it:
         node .claude/skills/pr-self-review/hooks/pr-gate.mjs record --verdict <clean|blocked> --criticals <N>
         (clean iff N == 0). This stamps the current diff hash — re-run after any fix.
- [ ] 6. Report (format below), leading with the gate result.
```

Run step 5 as the **last** action, after any fixes, so the recorded hash matches the tree the
user will push. If the diff changes afterward, the hook marks the review stale and asks for a
re-run.

## Report format

```
PR Self-Review — <BLOCKED: N critical> | <PASS: 0 critical>
Scope: <X files> across buckets: <UI, Backend, …>

CRITICAL (blocks push)
- <file:line> [<skill>] <title> — <why>. Fix: <fix>.

HIGH / MEDIUM / LOW
- <file:line> [<skill>] <title> — <why>.

Verdict recorded: <clean|blocked>. <Next step.>
```

If blocked, state plainly that `git push` / `gh pr create` / `gh pr merge` will be denied until
every critical is resolved and the review re-run.

## Boundaries

- **Local gate only.** It blocks local `git push` / `gh pr create` / `gh pr merge`; it cannot
  reach GitHub's web "Merge" button. The guarantee is *verify before the PR is opened/updated*.
- **A guardrail, not a lock.** A user can bypass the hook; treat a block as a strong signal to
  fix, not an unbreakable wall.
- **Quality of signal over volume.** Report the criticals and the few high-value findings; don't
  pad with style nits the routed skills wouldn't flag.
- **No rules of its own.** If a finding feels wrong, fix the routed skill, not this orchestrator.
