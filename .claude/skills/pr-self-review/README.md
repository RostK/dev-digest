# pr-self-review

A local **pre-PR gate** for DevDigest. Before code leaves the machine, it reviews the current
diff by reusing the repo's *own* skills as the rubric — UI files through the frontend skills,
backend & domain files through the backend skills, with zod / typescript / security across both
— and **blocks the push / PR when any critical is found**. The goal: verify changes locally
*before* opening a pull request.

## How it fits together

| Piece | Role |
|---|---|
| `SKILL.md` | The orchestrator Claude follows: scope → route → fan-out review → severity → record → report. |
| `references/skill-routing.md` | The full glob → skill map and why each skill owns each file. |
| `references/severity-rubric.md` | The four severity levels and the exact critical list that blocks the gate. |
| `hooks/pr-gate.mjs` | `PreToolUse` hook (matcher `Bash`) that denies `git push` / `gh pr create` / `gh pr merge` when the diff is un-reviewed, stale, or critical-blocked. Also the `record` writer for the verdict. |
| `evals/evals.json` | Trigger + routing + gate evals. |

The hook is registered in `.claude/settings.json` alongside the existing `engineering-insights`
Stop hook. It follows the same "a hook can't call a skill — it blocks and injects an
instruction" pattern: on a denied command Claude runs `/pr-self-review`, records a clean
verdict, then retries the command.

## State

`.claude/.pr-self-review-state.json` (gitignored) holds the last verdict and the hash of the
reviewed diff (`base...HEAD` ∪ working tree ∪ untracked). The hook recomputes that hash on every
gated command; any change makes the prior review **stale** and forces a re-run. The hash
algorithm lives only in `pr-gate.mjs` so the writer (`record` mode) and the reader (hook mode)
can never drift.

## Known tradeoffs

- **Local-only.** It gates local git/gh commands; it cannot block a merge done from GitHub's web
  UI. It enforces "review before the PR exists/updates."
- **Fail-open.** If the hook errors (not a git repo, git missing, malformed state) it exits 0 and
  allows the command — a hook bug must never strand the user. The review is a guardrail, not a
  hard lock.
- **Untracked-file content** changes that leave the tracked diff untouched may not always
  invalidate the cache; the review reads new files whole regardless.

## Manual use

`/pr-self-review` runs the same review on demand — useful to pre-flight a branch before you even
reach for `git push`.

## Configuration

- `PR_SELF_REVIEW_BASE` (env) overrides the base branch for the diff scope (default `main`).
