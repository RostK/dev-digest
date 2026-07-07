/**
 * Pure, LLM-free, deterministic eval scorer (SPEC-05).
 *
 * No `container`, no adapters, no DB, no I/O. Imports ONLY `@devdigest/shared`
 * contract types and the two grounding helpers reused from `reviewer-core`'s
 * public API (`buildLineIndex` / `rangeIntersects`) — this import-purity is
 * what makes AC-8 ("zero LLM calls in the scoring path") structurally
 * provable, not just tested.
 *
 * Matching rule (mirrors `reviewer-core/src/grounding.ts` exactly): an
 * expected finding matches a produced finding when they share the same
 * `file` AND their `[start_line, end_line]` ranges overlap — UNLESS the
 * produced finding's `kind` is one of the full-file kinds
 * (`secret_leak` | `lethal_trifecta` | `phantom` | `hook`), in which case the
 * match is on file presence only (no line-range check), exactly like the
 * engine's grounding gate.
 */
import type {
  EvalExpectation,
  EvalExpectedFinding,
  Finding,
  UnifiedDiff,
} from '@devdigest/shared';
import { buildLineIndex, rangeIntersects } from '@devdigest/reviewer-core';

/** Mirrors reviewer-core/src/grounding.ts FULL_FILE_KINDS — do not diverge. */
const FULL_FILE_KINDS = new Set(['secret_leak', 'lethal_trifecta', 'phantom', 'hook']);

/** A skipped-case reason, surfaced by the caller (AC-16) — not used here directly. */
export interface CaseScoreInput {
  expectation: EvalExpectation;
  /** The produced (already grounded/kept) findings for this case's review pass. */
  produced: Finding[];
  /** Findings dropped by the engine's grounding gate for this case. */
  dropped: number;
}

export interface CaseScoreResult {
  recall_case: number | null;
  precision_case: number;
  pass: boolean;
  /** Raw findings kept (survived grounding) for this case — feeds the pooled citation_accuracy. */
  kept: number;
  /** Raw findings dropped by grounding for this case — feeds the pooled citation_accuracy. */
  dropped: number;
}

export interface RunAggregate {
  recall: number;
  precision: number;
  citation_accuracy: number;
  traces_passed: number;
  traces_total: number;
}

/**
 * Dedupe expected findings within a case by the key `(file, start_line, end_line)`
 * so the same skeleton is never double-counted in a case's denominator.
 */
export function dedupeExpected(findings: EvalExpectedFinding[]): EvalExpectedFinding[] {
  const seen = new Set<string>();
  const out: EvalExpectedFinding[] = [];
  for (const f of findings) {
    const key = `${f.file} ${f.start_line} ${f.end_line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/**
 * Does `expected` match `produced`? Same file AND overlapping line range —
 * UNLESS `produced.kind` is a full-file kind, in which case file presence is
 * sufficient (mirrors reviewer-core's grounding full-file exemption).
 *
 * The overlap check reuses reviewer-core's grounding primitives directly: the
 * produced finding's own line range is wrapped as a synthetic single-file,
 * single-hunk `UnifiedDiff` so `buildLineIndex` can turn it into the same
 * per-file line-set shape the engine builds from real diff hunks, then
 * `rangeIntersects` tests the expected range against that set — identical
 * intersection semantics to how the engine grounds a finding against a hunk.
 */
export function matchExpected(
  expected: EvalExpectedFinding,
  produced: Finding,
): boolean {
  if (expected.file !== produced.file) return false;

  const isFullFile = produced.kind ? FULL_FILE_KINDS.has(produced.kind) : false;
  if (isFullFile) return true;

  // The Finding contract permits end_line < start_line; normalize to [lo, hi]
  // so the synthetic hunk spans the whole range. Without this, buildLineIndex's
  // `Math.max(oldLines, 1)` collapses an inverted range to just {start_line}
  // and a legitimately overlapping expected range is missed.
  const lo = Math.min(produced.start_line, produced.end_line);
  const hi = Math.max(produced.start_line, produced.end_line);
  const producedAsDiff: UnifiedDiff = {
    raw: '',
    files: [
      {
        path: produced.file,
        additions: 0,
        deletions: 0,
        hunks: [
          {
            file: produced.file,
            oldStart: lo,
            oldLines: hi - lo + 1,
            newStart: lo,
            newLines: hi - lo + 1,
            newLineNumbers: [],
          },
        ],
      },
    ],
  };
  const lineIndex = buildLineIndex(producedAsDiff);
  const lines = lineIndex.get(produced.file) ?? new Set<number>();
  return rangeIntersects(lines, expected.start_line, expected.end_line);
}

/**
 * Score a single case: recall/precision against its expectation, plus the
 * per-case pass rule (AC-17).
 *
 * - `must_find`: recall_case = (# expected matched) / (# expected); STRICT
 *   precision_case = (# produced findings that match an expected MUST_FIND
 *   finding) / (# produced findings) — a produced finding only counts toward
 *   the numerator when the case's expectation `kind` is `must_find` (AC-6).
 * - `must_not_flag` (or any case with 0 must_find expectations): recall_case
 *   is null (excluded from the run recall average). No produced finding can
 *   ever match a "must_find finding" here (there isn't one), so ANY produced
 *   finding is a false positive lowering precision_case — including one that
 *   lands on the forbidden region itself.
 * - A case with 0 produced findings always has precision_case = 1 (vacuous).
 */
export function scoreCase({
  expectation,
  produced,
  dropped,
}: CaseScoreInput): CaseScoreResult {
  const expected = dedupeExpected(expectation.findings);
  const isMustFind = expectation.kind === 'must_find';

  let recall_case: number | null = null;
  if (isMustFind) {
    if (expected.length === 0) {
      recall_case = null;
    } else {
      const matchedCount = expected.filter((exp) =>
        produced.some((p) => matchExpected(exp, p)),
      ).length;
      recall_case = matchedCount / expected.length;
    }
  }

  let precision_case: number;
  if (produced.length === 0) {
    precision_case = 1;
  } else if (!isMustFind) {
    // No "must_find finding" exists in this case's expectation, so no
    // produced finding can match one — every produced finding is a false
    // positive (STRICT precision, AC-6).
    precision_case = 0;
  } else {
    const matchingProduced = produced.filter((p) =>
      expected.some((exp) => matchExpected(exp, p)),
    ).length;
    precision_case = matchingProduced / produced.length;
  }

  const pass = isMustFind && expected.length > 0
    ? recall_case === 1 && precision_case === 1
    : precision_case === 1;

  return {
    recall_case,
    precision_case,
    pass,
    kept: produced.length,
    dropped,
  };
}

/**
 * Aggregate per-case results into the run-level metrics (AC-5, AC-6, AC-7, AC-17).
 */
export function aggregateRun(caseResults: CaseScoreResult[]): RunAggregate {
  const recallCases = caseResults.filter((c) => c.recall_case !== null);
  const recall =
    recallCases.length === 0
      ? 1
      : recallCases.reduce((sum, c) => sum + (c.recall_case ?? 0), 0) / recallCases.length;

  const precision =
    caseResults.length === 0
      ? 1
      : caseResults.reduce((sum, c) => sum + c.precision_case, 0) / caseResults.length;

  const totalKept = caseResults.reduce((sum, c) => sum + c.kept, 0);
  const totalDropped = caseResults.reduce((sum, c) => sum + c.dropped, 0);
  const citation_accuracy =
    totalKept + totalDropped === 0 ? 1 : totalKept / (totalKept + totalDropped);

  const traces_passed = caseResults.filter((c) => c.pass).length;
  const traces_total = caseResults.length;

  return { recall, precision, citation_accuracy, traces_passed, traces_total };
}
