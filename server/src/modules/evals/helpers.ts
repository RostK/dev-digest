import type { EvalExpectation, EvalExpectedFinding } from '@devdigest/shared';
import { Severity, FindingCategory } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import type { FindingRow } from '../../db/rows.js';

/**
 * Reconstruct a unified-diff STRING from persisted `pr_files` patches — the
 * same technique `modules/reviews/diff-loader.ts` uses for its own fallback,
 * duplicated here (not imported) because that function lives behind the
 * reviews module's `ReviewRepository` and cross-module reads must go through
 * this module's OWN repository (server/INSIGHTS.md:47).
 *
 * A file with a null `patch` (GitHub omits patches for large/binary files) is
 * skipped, exactly like `diffFromPrFiles`. Returns '' when no file has a patch
 * — the caller (`runSet`) treats an empty diff as a skip-this-case condition
 * (AC-16), never sending it to the engine.
 */
export function buildDiffFromPrFiles(files: { path: string; patch: string | null }[]): string {
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parts.join('\n');
}

/** Parse a diff string captured by `buildDiffFromPrFiles` back into a UnifiedDiff
 *  for the engine call — thin re-export so callers don't need to know the
 *  underlying adapter. */
export const parseCaseDiff = parseUnifiedDiff;

/**
 * Build an `EvalExpectation` from a single accepted/dismissed finding (AC-1/AC-2):
 *  - an ACCEPTED finding (the human confirmed it's a real issue) → `must_find`:
 *    the agent should keep flagging this on a re-run.
 *  - a DISMISSED finding (the human said it's not an issue) → `must_not_flag`:
 *    the agent should NOT raise a finding at this location again.
 *
 * Exactly one `findings[]` entry, carrying the finding's own file/line range +
 * severity/category/title so the expectation is directly checkable by the
 * committed `scoring.ts` (matchExpected: same file + overlapping range).
 */
export function expectationFromFinding(finding: FindingRow): EvalExpectation {
  const kind: EvalExpectation['kind'] = finding.dismissedAt ? 'must_not_flag' : 'must_find';
  // findings.severity/category are unconstrained `text` columns (schema/eval.ts
  // predates a DB enum) — safeParse rather than blind-cast so a legacy/off-
  // contract row degrades to `undefined` instead of forging an invalid enum
  // value into the persisted expectation.
  const severityParsed = Severity.safeParse(finding.severity);
  const categoryParsed = FindingCategory.safeParse(finding.category);
  const expected: EvalExpectedFinding = {
    file: finding.file,
    start_line: finding.startLine,
    end_line: finding.endLine,
    severity: severityParsed.success ? severityParsed.data : undefined,
    category: categoryParsed.success ? categoryParsed.data : undefined,
    title: finding.title ?? undefined,
  };
  return { kind, findings: [expected] };
}

/** A human-readable case name derived from the finding (AC-1/AC-2 traceability). */
export function caseNameFromFinding(finding: FindingRow): string {
  const verb = finding.dismissedAt ? 'must-not-flag' : 'must-find';
  return `${verb}: ${finding.title} (${finding.file}:${finding.startLine})`;
}
