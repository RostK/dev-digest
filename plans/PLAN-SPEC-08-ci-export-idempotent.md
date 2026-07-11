# Implementation Plan — SPEC-08 Idempotent Export to CI (reset-to-base)

- **Spec (WHAT):** [`specs/cross/SPEC-08-2026-07-10-ci-export-idempotent.md`](../specs/cross/SPEC-08-2026-07-10-ci-export-idempotent.md) — Status: approved. Reuses `AC-1 … AC-7` verbatim.
- **Plan (HOW):** this file.
- **Date planned:** 2026-07-10
- **Execution mode:** SINGLE-AGENT · backend (confirmed by user 2026-07-10). Three tightly-coupled server files + one new `.it` test; the mock and the test are interdependent and the real-adapter change has no unit-testable surface without hitting GitHub, so a parallel split buys nothing and risks a half-wired mock. One sequential pass keeps the tree buildable at each step.

## Resolved decisions (planner clarifications)
- **OQ-1 — unconditional reset-to-base, NO contract field/flag.** `commitFiles` has exactly **one caller** (`CiService.install`, `service.ts:83`) and `CommitFilesPayload` is **server-only** (grep-verified: the client's vendored `GitHubClient` has no `commitFiles`/`CommitFile`/`CommitFilesPayload`). So `commitFiles` is changed **unconditionally** to reset-to-base — no delete field, no flag, **no dual-vendor edit, no contract change**. This corrects the spec's cautious dual-vendor note (Dependencies/Cross-module): even a flag would have been server-only. Simplest v1.

## Requirements review
- **Understood requirements** (restated from the approved spec — not re-authored):
  1. Make the `action:'open_pr'` export idempotent via **reset-to-base**: each export force-updates `devdigest/ci` so its tree = **base branch tree + exactly the current bundle** (AC-1, AC-7).
  2. Self-heal an already-broken multi-manifest branch (PR #22) on the next export (AC-3); same-agent re-export stays a clean single-manifest update (AC-2).
  3. Keep writing runner files, workflow, empty `memory.jsonl`, and reuse the single `devdigest/ci` PR (AC-4).
  4. Leave the `action:'files'` zip path byte-identical (AC-5).
  5. Preserve every SPEC-07 invariant — no LLM in export, `provider:'openrouter'` + verbatim model, no secret in any committed file, actionable 422 on token-perm failure, non-`gha` no-op (AC-6).
  6. The force-update MUST target the `devdigest/ci` ref **only** — never commit to `base` (AC-6/AC-7, security NFR).
- **Assumptions** (verified by the planner on this tree):
  - `commitFiles` has **exactly one caller** — `CiService.install` (`service.ts:83`). Verified by grep (`service.ts:83`, `octokit.ts:265` impl, `mocks.ts:224` mock, `vendor/shared/adapters.ts:170` type). Changing `commitFiles` **unconditionally** is safe — no other consumer depends on the old "layer onto branch head" semantics.
  - `CiService.install` needs **no functional change** — it already threads `base: input.base` + the freshly-built bundle into `commitFiles` (`service.ts:83-88`). The bug is entirely inside `commitFiles`' tree/parent selection.
  - The `.it` test is the right split: `install()` reads a real agent + linked skills (`container.agentsRepo`) and upserts an installation row — both DB-backed.
- **Open questions / clarifications**: none blocking (OQ-1 resolved above).
- **Research needed**: **none.** Reset-to-base needs **no Octokit method not already used** — read the base ref/commit, `createTree` with `base_tree`, `createCommit`, `createRef`/`updateRef force:true` are all present in `octokit.ts:279-325` (the "branch missing" path already reads `heads/${base}`). Only *which* ref feeds the tree/parent changes.

## Acceptance criteria (restated verbatim from the spec — traceability anchors)
- **AC-1** — after exporting a *different* agent to a repo whose `devdigest/ci` already carries a prior agent's bundle, `.devdigest/agents/` contains exactly the current `<slug>.yaml`, no stale manifest. · Verify: `*.it.test.ts` — export A (`a.yaml`) then B (`b.yaml`); branch has only `b.yaml`.
- **AC-2** — same-agent re-export stays a single `<slug>.yaml`, no duplication. · Verify: `*.it.test.ts` — export A twice; one `a.yaml`, no other manifest.
- **AC-3** — a branch already in the broken two-manifest state self-heals to only the current `<slug>.yaml`. · Verify: `*.it.test.ts` — seed two manifests, export B, only `b.yaml` remains.
- **AC-4** — still writes `.devdigest/runner/`, the workflow, empty `memory.jsonl`, and opens/reuses a **single** PR. · Verify: `*.it.test.ts` — committed set includes runner + workflow + `memory.jsonl`; second export reuses the PR (one PR total).
- **AC-5** — `action:'files'` bundle unchanged; idempotency fix does not touch the zip path. · Verify: `*.it.test.ts` — returns bundle only; `commitFiles` not called; no branch/PR side effect.
- **AC-6** — preserves SPEC-07 invariants: no LLM in export; `provider:'openrouter'` + verbatim model; no secret in any committed file; token-perm failure → actionable `ValidationError` (422); non-`gha` no functional export. · Verify: unit + `*.it.test.ts` — regression assertions (SPEC-07 AC-2/AC-9/AC-13/AC-20); no `container.llm` call.
- **AC-7** — `open_pr` force-updates `devdigest/ci` so its tree = **base** tree + exactly the current bundle; no prior-export file (stale manifest, `.devdigest/skills/*.md`, any branch-only file) and no unrelated branch-only file remains; commit parents on **base**, not the prior branch head. · Verify: `*.it.test.ts` — seed `a.yaml` + stale `skills/s1.md` + unrelated `notes.txt`; export B; branch tree = base + current bundle (only `b.yaml`, no `s1.md`, no `notes.txt`), reset-from-base.

## Non-functional requirements
- **Security / correctness (load-bearing, AC-6/AC-7):** the force-update targets the `heads/devdigest/ci` ref **only** — `commitFiles` MUST NOT `updateRef`/`createRef` on `heads/${base}`. No secret in any committed bundle file. → Steps S1 (ref discipline) + S4 (assertions).
- **Perf:** export stays a bounded GitHub REST sequence; no LLM. Reset adds **zero** extra round-trips vs. today (same base-ref read the missing-branch path already did). → S1.
- **Privacy:** `memory.jsonl` stays empty; no new committed content. → S4 (AC-4).
- **Tenancy:** unchanged — `install` resolves the agent within `workspaceId` first; no new cross-workspace surface.

## Scope
- **Modules touched:** `server/src/adapters/github/octokit.ts` · `server/src/adapters/mocks.ts` · `server/src/vendor/shared/adapters.ts` (doc-only) · `server/test/ci-export.it.test.ts` (new).
- **Deliberately NOT touched:** `server/src/modules/ci/service.ts` (already threads `base` + fresh bundle — verified no change), `ci/manifest.ts`, `ci/workflow.ts`, `ci/helpers.ts`, `ci/repository.ts`, `ci/constants.ts`, the runner, any UI, any DB/migration.
- **Contracts changed:** **none functional.** `CommitFilesPayload` is **server-only** (client has no `commitFiles`). Only an optional **doc-comment** update, server copy only (S3).

## Implementation steps (single-agent; each leaves the tree buildable)

### [S1] Reset-to-base in the real adapter · track: backend
- **Files:** `server/src/adapters/github/octokit.ts` — modify `commitFiles` (`:265-331`):
  - Always read `heads/${payload.base}` → `baseSha` + `getCommit(baseSha)` → `baseCommit.tree.sha` (the "branch missing" path already does this read at `:284-285`).
  - `createTree({ base_tree: baseCommit.data.tree.sha, tree: files })` — **base tree, not the existing branch-head tree** (removes the `:293` branch-head `base_tree` bug + the "so unrelated files are kept" comment at `:288`).
  - `createCommit({ tree, parents: [baseSha] })` — parent on **base head**, not the prior branch head (AC-7).
  - Keep a `getRef(heads/${branch})` probe **solely** to choose `createRef` (missing) vs `updateRef({ force:true })` (exists) — the ref write still targets `heads/${payload.branch}` and **never** `heads/${base}`.
- **Skills:** `onion-architecture` (external call stays behind the adapter port), `typescript-expert` (`.js` ESM imports, Octokit types).
- **Pitfalls:** security NFR — the force-update must hit the `devdigest/ci` ref only; a stray `updateRef` on `heads/${base}` would push to base. Keep the whole reset sequence inside the existing `withRetry`/`withTimeout` closure (`:269-270`, `TIMEOUT=30_000`); add no un-wrapped calls.
- **DoD:** `commitFiles` builds tree from base + files, parents on base, force-updates only the branch ref; `node_modules/.bin/tsc --noEmit -p tsconfig.json` clean. Satisfies **AC-7** (mechanism) + **AC-6** (ref discipline). No new Octokit method.
- **Depends on:** none.

### [S2] Model reset-to-base in the GitHub mock · track: backend
- **Files:** `server/src/adapters/mocks.ts` — extend `MockGitHubClient` (`:131-253`) + `MockGitHubOptions` (`:123-129`):
  - Seed options: `baseTree?: Record<string,string>` (files on base, keyed by path) and `branchFiles?: Record<string, Record<string,string>>` (pre-existing files per branch — to seed the broken/PR-#22 state + unrelated files).
  - Resolved state: `public branches: Record<string, Record<string,string>> = {}` and `public resets: { branch:string; base:string }[] = []`.
  - In `commitFiles` (`:224`): **rebuild from base, ignoring prior branch contents** — `this.branches[payload.branch] = { ...(this.opts.baseTree ?? {}), ...Object.fromEntries(payload.files.map(f => [f.path, f.contents])) }`; push `{ branch, base }` to `resets`. Keep pushing to `this.committed` for back-compat. **Must NOT layer onto `branchFiles[branch]`** — deriving the result from base is what encodes reset-to-base and stops a test from falsely passing the old layering behavior.
  - Optional `throwOnCommit?: { status:number }` so an `.it` case drives the 403→422 mapping (AC-6) without a network.
- **Skills:** `typescript-expert`, `onion-architecture` (mock implements the same port; deterministic, no network).
- **Pitfalls:** `server/INSIGHTS.md:44` — `@devdigest/shared` is vendored independently, **but `CommitFilesPayload` lives only in the server copy**, so this is server-only; do NOT hunt a client mirror. Bundle paths are POSIX-normalized (`ci/helpers.ts:64`); mock keys + assertions use `/`-separated paths, never OS separators (Windows path trap, `server/INSIGHTS.md:26`).
- **DoD:** mock exposes a queryable post-export branch tree = base + supplied files, prior branch contents dropped; supports seeding base + pre-existing branch files + a throw. Enables **AC-1/2/3/4/5/7**. `tsc` clean.
- **Depends on:** none (authored before S4).

### [S3] Fix the contract doc comment (server copy only) · track: backend
- **Files:** `server/src/vendor/shared/adapters.ts` — update JSDoc on `commitFiles` (`:165-170`) and optionally `CommitFilesPayload` (`:134-141`): replace the now-wrong "Creates the branch from base if missing, else fast-forwards it. Idempotent: re-publishing just adds a new commit." with reset-to-base semantics — *"Force-updates `branch` so its tree = `base` branch's tree + exactly `files`. The branch is export-owned: any prior content on it is discarded. Targets the `branch` ref only, never `base`."*
- **Skills:** `typescript-expert`.
- **Pitfalls:** `server/INSIGHTS.md:44` — no client copy of this type exists, so this is a **one-copy** edit (dual-vendor rule does not apply to `CommitFilesPayload`). Do not add a delete/flag field (OQ-1).
- **DoD:** doc matches new behavior; `tsc` clean. Documentation-only; no AC surface.
- **Depends on:** none.

### [S4] New DB-backed test — `ci-export.it.test.ts` · track: backend
- **Files:** `server/test/ci-export.it.test.ts` (create) — the CI module's first automated test. Pattern off `server/test/brief.it.test.ts:1-70` (`dockerAvailable()` self-skip, `buildApp({ db, overrides })`, `seed`, `MockLLMProvider`). Build with `overrides.github = new MockGitHubClient({...})` (`container.ts:45,175-177`) and `overrides.llm` a `MockLLMProvider` to prove zero calls. Seed/create an agent (+ enabled skills) so `install()` resolves a real agent.
- **Cases (AC → case):**

  | AC | case |
  |----|------|
  | AC-1 | "different agent replaces prior manifest" — export A then B; branch has `.devdigest/agents/b.yaml`, not `a.yaml` |
  | AC-2 | "same-agent re-export stays single manifest" — export A twice; exactly one `a.yaml` |
  | AC-3 | "self-heals a two-manifest branch (PR #22)" — seed `branchFiles` with `a.yaml`+`c.yaml`; export B; only `b.yaml` |
  | AC-4 | "commits runner+workflow+memory, reuses one PR" — assert `.devdigest/runner/*`, workflow, empty `memory.jsonl`; export twice → `openedPrs.length === 1` |
  | AC-5 | "action:'files' has no side effect" — `result.files` non-empty, `installation===null`, `pr_url===null`, `committed.length===0`, `openedPrs.length===0` |
  | AC-6 | "no LLM; openrouter+model; no secret; 403→422; non-gha no-op" — `mockLLM.calls.length===0`; `b.yaml` has `provider: openrouter` + verbatim `model`; no committed file contains `sk-`/`ghp_`/`github_pat`; `throwOnCommit:{status:403}` → `ValidationError`; `target:'local'` → `ValidationError`, `committed` empty |
  | AC-7 | "branch tree = base + bundle; drops stale skills + unrelated" — seed `baseTree` (`README.md`+`notes.txt`) + `branchFiles` (`a.yaml`+`.devdigest/skills/s1.md`+branch-only `extra.txt`); export B; final branch = base ∪ current bundle (only `b.yaml`, no `s1.md`/`a.yaml`/`extra.txt`); `resets` recorded `base === input.base` |

- **Skills:** `typescript-expert`, `zod` (parse manifest YAML for field asserts).
- **Pitfalls (critical):**
  - `server/INSIGHTS.md:139` — `agent-runner/dist/` is **gitignored** and absent in a fresh worktree, so `install()`→`buildBundle`→`readRunnerFiles()` throws `ConfigError`. **Before running this `.it`, the worktree must have `agent-runner/dist/` built** (it IS built in the current worktree; a fresh implementer worktree must `cd agent-runner && pnpm install && pnpm build`, or set `DEVDIGEST_RUNNER_DIR`). Otherwise every `open_pr` case fails on bundle assembly, not the code under test.
  - `server/CLAUDE.md` — the `.it.test.ts` suffix is mandatory for the DB-backed split; testcontainers self-skips without Docker.
  - `server/INSIGHTS.md:124` — `pnpm typecheck`/`pnpm test` can fail pre-run on a fresh worktree via pnpm's deps-status check; run the binary directly (`node_modules/.bin/vitest run test/ci-export.it.test.ts`, `node_modules/.bin/tsc --noEmit`).
  - `server/INSIGHTS.md:123` — `yaml.stringify`→`parse` round-trips losslessly, so asserting `provider`/`model` by parsing YAML is safe.
- **DoD:** `node_modules/.bin/vitest run test/ci-export.it.test.ts` green (or self-skips cleanly without Docker), all AC-1..AC-7 cases; `tsc` clean.
- **Depends on:** **S1 + S2**.

## Test plan
- **Existing suites that must still pass** (run the binary directly per `server/INSIGHTS.md:124`):
  - `cd server && node_modules/.bin/vitest run test/adapters.test.ts test/contracts.test.ts test/routes-smoke.test.ts` (mock/adapter + contract surface).
  - Full regression sweep: `cd server && node_modules/.bin/vitest run` (the 6 pre-existing `indexer-pipeline` Windows flakes, `server/INSIGHTS.md:113`, are baseline noise, not from this change).
- **New test** (`.it` = DB-backed testcontainers split): `server/test/ci-export.it.test.ts`.
- AC → case map is the table in S4.

## Risks & review gates
- **Behavioral change to a shared primitive:** `commitFiles` no longer preserves unrelated files on `devdigest/ci` (export-owned). Spec's accepted trade-off (AC-7, Non-goal); safe because `commitFiles` has exactly one caller — but the one thing a reviewer should consciously sign off. **Human check before merge.**
- **Security ref discipline:** confirm in review that no code path writes `heads/${base}` (only `heads/${branch}`) — a mistake here would push to `main`. Not exercisable against real GitHub in `.it`; verify by reading S1's diff.
- **Real-adapter reset not exercised by the `.it`** (the `.it` drives the mock). The literal "commit parents on the base SHA" (AC-7 verify) is a real-Octokit behavior the mock approximates via `resets[].base`; treat the S1 diff as the source of truth. Honest gap, flagged not faked.
- **Worktree prerequisite:** `agent-runner/dist/` must be built or the `.it` fails on bundle assembly (`server/INSIGHTS.md:139`). Already built in this worktree.

## Handoff
`/implement plans/PLAN-SPEC-08-ci-export-idempotent.md` — single-agent backend pass → review gates (plan-verifier + architecture-reviewer + /code-review) → bounded fix loop → pre-push gate. `plan-verifier` traces the code against AC-1..AC-7 in this file.
