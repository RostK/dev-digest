---
name: dependencies-checker
description: "Audits every package's dependencies in the DevDigest repo (server, client, reviewer-core, e2e — four independent package.json/lockfile pairs, not a pnpm workspace) and produces a structured report: an inventory table per package with real on-disk sizes, a Mermaid dependency diagram, a repo-wide size ranking, and grounded cleanup recommendations (duplicates across packages, oversized deps, possibly-unused deps, outdated majors). Use this skill WHENEVER the user asks to audit, inventory, or check dependencies; asks 'what's making node_modules so big', 'do we have duplicate packages across server and client', 'which deps should we drop or replace'; or wants a dependency diagram/graph/report — even if they don't name a specific package or say 'dependencies-checker' explicitly."
when_to_use: "Trigger phrases: 'check our dependencies', 'audit dependencies', 'dependency report', 'why is node_modules so big', 'find duplicate/shared dependencies', 'which packages are we duplicating across server and client', 'dependency diagram', 'what should we drop from package.json'. Read-only and safe to run anytime; it never edits package.json or installs/removes packages itself — it reports and recommends."
version: 1.0.0
---

# Dependencies Checker

Audit dependencies across all four DevDigest packages (`server`, `client`,
`reviewer-core`, `e2e`) and turn them into a report a developer can scan in under a
minute: what's installed, how big it is, what's duplicated, and what's worth cleaning
up. Every number in the report must come from a real measurement or a grep hit — never
estimate a size or invent a "lighter alternative" you haven't verified is a real,
comparable package.

## Why a script, not eyeballing

Sizes have to be repeatable across runs (so a second audit next quarter is comparable
to this one), and "how big is this dependency's on-disk footprint" isn't something you
can read off `package.json` — it depends on what's actually resolved and installed.
`scripts/audit-deps.mjs` does this once, deterministically: for each package it reads
`dependencies`/`devDependencies`, and where `node_modules` exists, computes each direct
dependency's real on-disk subtree size plus the package's total `node_modules` size.

Run it from the repo root:

```
node .claude/skills/dependencies-checker/scripts/audit-deps.mjs
```

It prints one JSON object to stdout — pipe it to a file if you want to keep the raw
data (`> /tmp/audit.json`), or just read it from the tool output. It already computes
the cross-package overlap (which dependency names appear in ≥2 packages, and whether
their resolved versions actually match) — you don't need to redo that comparison by
hand.

**Size caveat to carry into the report** — the per-dependency size follows nested
dependencies down into the install tree but only dedupes *within* that one dependency's
own subtree, not against its siblings. Two direct deps that both pull in the same heavy
nested package will each show that weight. This makes the numbers a reliable *ranking*
signal (which deps are the heavy hitters) but not an exact "bytes reclaimed if removed"
promise — say so if a recommendation leans on it.

**Not-installed packages** — `e2e` doesn't ship an installed `node_modules` by default
in this repo. The script reports `installed: false` and every dependency's size as
`null` rather than failing; report those rows with sizes as "not installed" instead of
0 or omitting them, and don't `npm install`/`pnpm install` on the user's behalf to fill
the gap — that's a mutation the user should decide to run themselves.

## Procedure

```
- [ ] 1. Run scripts/audit-deps.mjs from the repo root; read the JSON result.
- [ ] 2. INVENTORY — for each package, build the table below from `dependencies[]`
         (name, type, declared range, resolved version, size). Note `installed: false`
         packages plainly instead of guessing their footprint.
- [ ] 3. DUPLICATES — from the `crossPackage[]` array, list every name in ≥2 packages
         with its resolved version per package and whether they match. server+client
         both vendoring `@devdigest/shared` is an *intentional* project convention (see
         shared_contracts_dual_vendor context) — call that out as expected, not a bug;
         everything else genuinely mismatched is a real finding.
- [ ] 4. UNUSED (heuristic, not a script) — for the top 10-15 heaviest direct
         dependencies, grep that package's own `src/` (or root for config-level tools)
         for the bare dependency name — NOT a strict `from ["']pkg["']` regex. A
         strict import-statement pattern misses subpath imports (`pkg/dist/x`),
         re-exports, and non-matching quote/spacing styles, and will wrongly flag
         real dependencies as unused (confirmed against this repo: `dependency-cruiser`,
         `@vscode/ripgrep`, and `mermaid` all looked unused under a strict pattern but
         are genuinely used). A miss on the loose search is "possibly unused — verify"
         not "unused": build-only tools (drizzle-kit, tailwindcss, vitest, tsx,
         typescript) are referenced from config files or `package.json` scripts, not
         source, so check both before flagging. Exclude `server/clones/**` from every
         search — it's a nested checkout the repo-indexing feature clones for analysis,
         not this package's own source, and matches there are noise.
- [ ] 5. OUTDATED (optional, best-effort) — if network access is available, `pnpm
         outdated --format json` (server/client) or `npm outdated --json`
         (reviewer-core/e2e) per package for major-version drift. Skip silently and
         say so in the report if these fail (offline, registry error) — don't block
         the rest of the report on it.
- [ ] 6. DIAGRAM — build the Mermaid graph (format below). Follow the mermaid-diagram
         skill for syntax; keep it to the four packages plus their heaviest ~5-8 direct
         deps each (not every dependency — a full transitive graph is unreadable).
         Style duplicate/shared nodes distinctly from single-package ones.
- [ ] 7. PRIORITIZE — sort all direct dependencies repo-wide by size, descending.
- [ ] 8. RECOMMEND — every bullet must cite the exact package(s) + dependency + number
         that justifies it. Only suggest a lighter alternative when it's a genuinely
         well-known swap you're confident about (e.g. moment → date-fns) — otherwise
         flag the size and stop there rather than inventing an alternative.
- [ ] 9. REPORT using the format below.
```

## Report format

```
# Dependency Audit — <date>
Packages scanned: server, client, reviewer-core, e2e (e2e: <installed|not installed>)
Repo-wide node_modules: <sum of installed packages' totals> across <N> installed packages
Direct dependencies: <N prod, N dev> · Shared across ≥2 packages: <N> · Possibly unused: <N>

## Inventory
### server (pnpm)
| Dependency | Type | Declared | Resolved | Size |
|---|---|---|---|---|
(one row per direct dependency, sorted by size desc; "not installed" in Size where null)

### client (pnpm)
...same table...

### reviewer-core (npm)
...same table...

### e2e (npm)
...same table, or "not installed — run `npm install` in e2e/ to get size data" if so...

## Dependency diagram
```mermaid
graph LR
  ...four package nodes, their heaviest deps, shared deps styled distinctly...
```

## Duplicates across packages
| Dependency | Packages | Resolved versions | Match? |
|---|---|---|---|
(from crossPackage[]; call out @devdigest/shared server/client dual-vendor as expected)

## Repo-wide size ranking (top 15)
| Rank | Dependency | Package(s) | Size |
|---|---|---|---|

## Recommendations
- <grounded, specific, cites package+dep+number — e.g. "drizzle-kit is a 7.8MB devDep
  only used via `db:generate`; fine to keep but don't add it to client">
...

## Skipped / degraded
- <e.g. "outdated check skipped: no network access" — omit this section if nothing was skipped>
```

## Boundaries

- **Read-only.** Never edit a `package.json`, run `npm install`/`uninstall`,
  `pnpm add`/`remove`, or touch a lockfile. The report recommends; the user decides
  and runs the change.
- **Never touch or suggest forking `server/src/vendor/shared/`** — it's dual-vendored
  by design (server + client each keep a copy); flag version drift between the two
  copies if found, don't suggest merging them into one.
- **Don't add tooling to make this easier.** No `depcheck`/eslint-plugin-unused-imports
  or similar installed as a side effect — the grep-based heuristic and the bundled
  script are deliberately dependency-free so running this audit never changes what's
  installed.
- **Not a workspace.** Don't suggest `pnpm -w`, hoisting everything into a root
  workspace, or a single repo-wide lockfile as a "fix" for duplication — that
  contradicts the project's explicit per-package isolation. A legitimate duplicate
  finding's fix is aligning versions independently in each package, not merging
  package managers.
