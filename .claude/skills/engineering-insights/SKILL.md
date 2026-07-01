---
name: engineering-insights
description: "Captures durable engineering learnings to the touched module's INSIGHTS.md. Use at the end of a substantive session (>30 min with a real problem, decision, or discovery) as a wrap-up, or mid-session when something non-obvious surfaces. Re-reads the target file first, then appends actionable-cold notes; never overwrites and never duplicates."
---

# Engineering Insights

Capture durable engineering learnings so knowledge **compounds** across sessions instead
of evaporating when the context window ends. Each learning is appended to the
`INSIGHTS.md` of the module it is about — so the next session working in that module
reads only its own file and signal stays high.

This is the project's smallest, foundational skill: it depends only on `CLAUDE.md` and
the per-module `INSIGHTS.md` files. No business logic.

## When to run

Double trigger:

- **Wrap-up** — at the end of a substantive session (>30 min that involved a real
  problem, decision, or discovery). Trivial config tweaks / one-line fixes → skip
  (quality of signal, not volume).
- **Capture-as-you-go** — when something non-obvious surfaces mid-session. Record a fix
  or decision only **once it's confirmed working**, not a half-solved guess (a wrong
  entry propagates to every future session until someone corrects it).

This skill is triggered by its `description` or run manually as `/engineering-insights`.
Be honest about the limit: trigger-by-description and manual runs are unreliable — "if it
requires a human trigger, it won't happen consistently enough to be useful". For
guaranteed capture, wire it to a `Stop` hook so it fires at the end of every session.

## Read-first (mandatory — start of every chat)

Before doing **any** work, once the user has given their prompt:

1. Read the relevant project doc per the root `CLAUDE.md` `## Use when` table — the doc
   for the area you are about to touch.
2. Read the touched/discussed module's `INSIGHTS.md` (see routing below) and treat it as
   **high-confidence guidance** unless told otherwise.
3. **Confirm and summarize** — state that you've read it and briefly summarize the top
   2–3 relevant points before starting. Forced active reading beats passive loading
   (which gets ignored) and verifies the file was actually read.

This is also the dedup baseline — you cannot avoid duplicating an insight you never read.

## Where to write — routing

Write to the `INSIGHTS.md` of the **deepest module that owns the changed files**:

| Work touched | File |
|---|---|
| `client/**` | `client/INSIGHTS.md` |
| `reviewer-core/**` | `reviewer-core/INSIGHTS.md` |
| `mcp/**` | `mcp/INSIGHTS.md` |
| `server/src/modules/repo-intel/**` | `server/src/modules/repo-intel/INSIGHTS.md` |
| anything else under `server/**` (other modules, `vendor/shared`, `db`, …) | `server/INSIGHTS.md` |
| `e2e/**` | `e2e/INSIGHTS.md` |

A session that touched several modules appends to **each** relevant file. If a target
file is missing, create it from the section skeleton below.

## File format — the 8 fixed sections

Every `INSIGHTS.md` has these sections (never free-form, never omit one):

1. **What Works** — patterns / solutions that proved out.
2. **What Doesn't Work** — dead ends and anti-patterns. *Most-skipped, most valuable —
   never omit.*
3. **Codebase Patterns** — how this codebase is structured / conventions to follow.
4. **Decisions** — architectural / design choices and the reasoning behind them (what
   was chosen, what was rejected, and why).
5. **Tool & Library Notes** — quirks of a dependency, CLI, or service.
6. **Recurring Errors & Fixes** — an error seen more than once + its fix.
7. **Session Notes** — datestamped narrative notes that don't fit a category above.
8. **Open Questions** — unresolved things for a future session.

### Record format

One record = a single line (or tight bullet):

```
- YYYY-MM-DD — <concrete, actionable statement>. Evidence: `path/file.ts:line`.
```

- Use the **current session date**.
- **Lead with the why** where it isn't obvious — the reason a thing must be done is what
  makes a record reusable (e.g. *"…always via Zustand (cartStore.ts) **because** the cart
  is shared by 3 components"*).
- **append-only**: add records, never rewrite or delete. Correct a stale record with a
  **new dated note beneath it** — keep the history (merge conflicts and erased lessons
  come from overwriting).

## Quality bar — concrete, deduplicated, substantial

Before appending, every candidate must pass **all three**:

1. **Actionable "cold"** — a future agent reads it and *knows what to do* without
   re-deriving it. Anti-banality test: *if it would be obvious to anyone reading the
   code, don't write it.*
   - ✗ `"Promises can be tricky"` / `"be careful with async"`
   - ✓ `"Promise.all() on the ingest pipeline times out past ~30 items — use
     Promise.allSettled() in batches of 10"`
   - ✓ `"checkout-flow state always goes through Zustand (cartStore.ts) — the cart is
     shared by 3 components, local state breaks here"`
2. **Substantial** — something genuinely new happened. **Nothing substantial → write
   nothing** (and say so). Do not pad.
3. **Not already present** — **re-read the target `INSIGHTS.md` first**; if the insight
   is already there, do **not** duplicate it. At most add a new dated note when you can
   make it materially more precise.

## Procedure

When invoked, copy this checklist and work through it:

```
- [ ] 1. Determine which module(s) the session touched (from the edits / diff)
- [ ] 2. Re-read each target INSIGHTS.md (dedup + context baseline)
- [ ] 3. Identify up to 2–5 concrete, non-obvious learnings from the session,
         sweeping each section: What Works / What Doesn't Work / Codebase Patterns /
         Decisions / Tool & Library Notes / Recurring Errors & Fixes / Open Questions
- [ ] 4. Drop anything already in the file (dedup) and anything that fails the
         substance or anti-banality gate
- [ ] 5. Append each survivor as a dated, evidence-grounded record under its section
         (+ a dated Session Notes line) — or write NOTHING if nothing cleared the bar
- [ ] 6. Confirm what was added: report a one-line summary per file (or state that
         nothing met the bar)
```

Default to fewer, higher-signal entries — 2–5 is a ceiling, not a quota. Zero is a
valid, common outcome.

## Boundaries

- **Not a replacement for docs** — architecture, API, and run steps stay in `README.md`
  / `CLAUDE.md`. `INSIGHTS.md` holds only durable, non-obvious learnings.
- **Not a crutch for bad tooling** — if the agent keeps tripping on the same thing, fix
  the root cause; record only genuine, project-specific workarounds.

## Maintenance

- Append-only during normal work; resolve conflicts by adding a newer dated note.
- **Team / git:** commit `INSIGHTS.md` to the repo so everyone benefits; keep it
  append-only in PRs (avoids merge conflicts); a maintainer periodically consolidates.
- A file growing past ~200 records or mixing domains → split into more specific files.
- `INSIGHTS.md` is a **draft under spot-check**, not gospel — a human reviews it
  periodically and prunes stale records (stale guidance is worse than none).
