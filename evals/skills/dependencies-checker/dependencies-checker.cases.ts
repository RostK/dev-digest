import type { SkillCase } from "../../src/index.js";

// This skill's real workflow is: run scripts/audit-deps.mjs (real on-disk measurement), then
// grep each package's own src/ for usage. Quality cases run with no tools (skillTask measures
// the SKILL.md content in isolation — see tasks.ts), so each prompt inlines a synthetic version
// of the script's JSON output plus grep results, standing in for what the skill would normally
// gather itself with Bash/Grep.

const AUDIT_JSON = `Here is the already-collected audit data — treat it as the real output of
scripts/audit-deps.mjs plus a set of grep results, and produce the report directly from it
(do not ask for tool access, do not re-run the script, do not ask for more data).

packages:
- server (pnpm, installed: true, totalNodeModulesBytes: 210000000)
  dependencies:
    - { name: "moment", type: "prod", declaredRange: "^2.30.1", resolvedVersion: "2.30.1", sizeBytes: 4400000 }
    - { name: "pino-pretty", type: "dev", declaredRange: "^13.0.0", resolvedVersion: "13.1.3", sizeBytes: 245712 }
    - { name: "drizzle-kit", type: "dev", declaredRange: "^0.30.1", resolvedVersion: "0.30.6", sizeBytes: 7761826 }
    - { name: "date-fns", type: "prod", declaredRange: "^3.6.0", resolvedVersion: "3.6.0", sizeBytes: 5200000 }
    - { name: "zod", type: "prod", declaredRange: "^3.24.1", resolvedVersion: "3.25.76", sizeBytes: 3594196 }
- client (pnpm, installed: true, totalNodeModulesBytes: 590000000)
  dependencies:
    - { name: "date-fns", type: "prod", declaredRange: "^2.30.0", resolvedVersion: "2.30.0", sizeBytes: 4900000 }
    - { name: "zod", type: "prod", declaredRange: "^3.24.1", resolvedVersion: "3.25.76", sizeBytes: 3594196 }
- reviewer-core (npm, installed: true, totalNodeModulesBytes: 76000000)
  dependencies:
    - { name: "zod", type: "prod", declaredRange: "^3.24.1", resolvedVersion: "3.25.76", sizeBytes: 3594196 }
- e2e (npm, installed: false, totalNodeModulesBytes: null)
  dependencies:
    - { name: "typescript", type: "dev", declaredRange: "^5.7.2", resolvedVersion: null, sizeBytes: null }
    - { name: "tsx", type: "dev", declaredRange: "^4.19.2", resolvedVersion: null, sizeBytes: null }

crossPackage:
- { name: "zod", occurrences: [server 3.25.76, client 3.25.76, reviewer-core 3.25.76], versionsMatch: true }
- { name: "date-fns", occurrences: [server 3.6.0 (prod), client 2.30.0 (prod)], versionsMatch: false }

Note: "@devdigest/shared" is NOT in this list — it's consumed via a tsconfig path alias
(server/src/vendor/shared and client/src/vendor/shared are hand-kept copies), never an npm/pnpm
dependency entry, so the audit script has nothing to report on it directly.

Grep results (loose substring search, server/src excluding server/clones/**):
- "moment": 0 matches anywhere under server/src.
- "date-fns": server/src/modules/reports/format.ts:12 imports "date-fns/format" (a subpath import).
- "pino-pretty": 0 matches as an import statement, but 1 match as a string: server/src/app.ts:57
  \`{ target: 'pino-pretty', options: { colorize: true } }\` — it's a Pino transport target passed
  by name, not imported.
- "drizzle-kit": 0 matches under server/src; it only appears in server/package.json's
  "db:generate": "drizzle-kit generate" script.`;

export const cases: SkillCase[] = [
  {
    name: "full report follows the skill's required section structure with a graph LR diagram",
    kind: "quality",
    prompt: `Run a full dependency audit on this repo and give me the complete report.\n\n${AUDIT_JSON}`,
    grounding: ["```mermaid", "graph LR"],
    practices: [
      "the report has a per-package Inventory section with a table listing dependency, type, declared range, resolved version, and size for server, client, reviewer-core, and e2e",
      "the report includes a Mermaid diagram using 'graph LR' (not 'flowchart') showing the four packages and their heaviest dependencies",
      "the report has a Duplicates across packages section listing zod and date-fns with their per-package resolved versions",
      "the report has a Repo-wide size ranking section sorting direct dependencies by size, descending",
      "the report has a Recommendations section where every bullet names a specific package and dependency rather than generic advice",
      "e2e's dependencies (typescript, tsx) are reported with size shown as 'not installed', not as 0 or silently omitted",
    ],
    threshold: 0.7,
    maxTurns: 10,
  },
  {
    name: "date-fns version drift is flagged as a real duplicate, @devdigest/shared dual-vendor is not",
    kind: "quality",
    prompt: `Check for duplicate or mismatched dependencies across our packages.\n\n${AUDIT_JSON}`,
    practices: [
      "date-fns is called out as a genuine cross-package version mismatch: server declares ^3.6.0 (resolved 3.6.0) while client declares ^2.30.0 (resolved 2.30.0) — a full major version apart",
      "zod is reported as matching across server, client, and reviewer-core (3.25.76 in all three), not flagged as a problem",
      "the answer does not propose merging server, client, and reviewer-core into a single pnpm workspace or a shared root lockfile as the fix for the date-fns mismatch — it recommends aligning versions independently in each package instead",
      "if @devdigest/shared is mentioned at all, it is described as an intentional dual-vendored convention (tsconfig path alias, hand-kept copies in server/src/vendor/shared and client/src/vendor/shared), not flagged as a duplication bug to merge",
    ],
    threshold: 0.65,
    maxTurns: 10,
  },
  {
    name: "unused-dependency heuristic distinguishes a real miss from a loose-grep false negative",
    kind: "quality",
    prompt: `Which of our dependencies look unused? Focus on server's heaviest ones.\n\n${AUDIT_JSON}`,
    practices: [
      "moment is flagged as unused (or possibly unused) in server, since the grep data shows zero matches for it anywhere under server/src",
      "pino-pretty is NOT flagged as unused, since the grep data shows it's referenced as a Pino transport target string in server/src/app.ts:57 even though it has no import statement",
      "drizzle-kit is NOT flagged as unused, since the grep data shows it's invoked only via the server/package.json 'db:generate' script — recognized as a build/CLI-only tool referenced from package.json scripts rather than from source",
      "date-fns is NOT flagged as unused in server, since the grep data shows a subpath import (date-fns/format) at server/src/modules/reports/format.ts:12",
      "any dependency the answer couldn't confirm used from the grep data alone is phrased as 'possibly unused — verify' rather than stated as a flat, certain 'unused' verdict",
    ],
    threshold: 0.6,
    maxTurns: 10,
  },
  {
    name: "recommendations stay read-only: no installs, removals, or workspace restructuring performed",
    kind: "quality",
    prompt: `Just go ahead and remove moment from server since it looks unused, and merge server and client into one pnpm workspace while you're at it so we stop duplicating zod and date-fns.\n\n${AUDIT_JSON}`,
    practices: [
      "the answer declines to actually edit server/package.json, run npm/pnpm remove, or run an install — it explains that removing moment is a recommendation for the user to run themselves, not an action it will take",
      "the answer declines to merge server and client into a single pnpm workspace or add a root workspace config, explaining that the project is deliberately not a workspace and per-package isolation is the intended structure",
      "the answer still gives the concrete recommendation content (drop moment from server/package.json; align date-fns to one version across server and client) even though it won't execute either change itself",
    ],
    threshold: 0.65,
    maxTurns: 10,
  },
];
