import { describe, expect, it } from 'vitest';
import type { EvalExpectation, Finding, UnifiedDiff } from '@devdigest/shared';
import { aggregateRun, dedupeExpected, matchExpected, scoreCase } from './scoring.js';

/** Minimal diff builder: one file with hunks covering the given new-side line ranges. */
function makeDiff(files: { path: string; lineRanges: [number, number][] }[]): UnifiedDiff {
  return {
    raw: '',
    files: files.map((f) => ({
      path: f.path,
      additions: 0,
      deletions: 0,
      hunks: f.lineRanges.map(([start, end]) => ({
        file: f.path,
        oldStart: start,
        oldLines: end - start + 1,
        newStart: start,
        newLines: end - start + 1,
        newLineNumbers: Array.from({ length: end - start + 1 }, (_, i) => start + i),
      })),
    })),
  };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id ?? 'f-1',
    severity: 'WARNING',
    category: 'bug',
    title: 'a finding',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'because',
    confidence: 0.9,
    ...overrides,
  };
}

describe('dedupeExpected', () => {
  it('drops duplicate (file, start_line, end_line) skeletons', () => {
    const findings = [
      { file: 'src/a.ts', start_line: 5, end_line: 5 },
      { file: 'src/a.ts', start_line: 5, end_line: 5 },
      { file: 'src/a.ts', start_line: 6, end_line: 6 },
    ];
    expect(dedupeExpected(findings)).toHaveLength(2);
  });
});

describe('matchExpected', () => {
  it('matches same file + overlapping line range', () => {
    const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 20]] }]);
    const expected = { file: 'src/a.ts', start_line: 10, end_line: 12 };
    const produced = makeFinding({ file: 'src/a.ts', start_line: 11, end_line: 11 });
    expect(matchExpected(expected, produced, diff)).toBe(true);
  });

  it('does not match a different file even with overlapping lines', () => {
    const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 20]] }]);
    const expected = { file: 'src/a.ts', start_line: 10, end_line: 12 };
    const produced = makeFinding({ file: 'src/b.ts', start_line: 11, end_line: 11 });
    expect(matchExpected(expected, produced, diff)).toBe(false);
  });

  it('does not match non-overlapping line ranges in the same file', () => {
    const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 20]] }]);
    const expected = { file: 'src/a.ts', start_line: 10, end_line: 12 };
    const produced = makeFinding({ file: 'src/a.ts', start_line: 50, end_line: 50 });
    expect(matchExpected(expected, produced, diff)).toBe(false);
  });

  it('matches on file presence only for a full-file kind (e.g. secret_leak)', () => {
    const diff = makeDiff([{ path: 'src/secrets.ts', lineRanges: [[1, 5]] }]);
    const expected = { file: 'src/secrets.ts', start_line: 999, end_line: 999 };
    const produced = makeFinding({
      file: 'src/secrets.ts',
      start_line: 1,
      end_line: 1,
      kind: 'secret_leak',
    });
    expect(matchExpected(expected, produced, diff)).toBe(true);
  });

  it('does NOT exempt a plain "finding" kind from the line-overlap check', () => {
    const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 20]] }]);
    const expected = { file: 'src/a.ts', start_line: 10, end_line: 12 };
    const produced = makeFinding({ file: 'src/a.ts', start_line: 50, end_line: 50, kind: 'finding' });
    expect(matchExpected(expected, produced, diff)).toBe(false);
  });
});

describe('scoreCase', () => {
  it('recall 0.5 — a must_find case with 2 expected + 1 matched produced finding', () => {
    const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 100]] }]);
    const expectation: EvalExpectation = {
      kind: 'must_find',
      findings: [
        { file: 'src/a.ts', start_line: 10, end_line: 10 },
        { file: 'src/a.ts', start_line: 20, end_line: 20 },
      ],
    };
    const produced = [makeFinding({ file: 'src/a.ts', start_line: 10, end_line: 10 })];

    const result = scoreCase({ expectation, produced, dropped: 0, diff });
    expect(result.recall_case).toBe(0.5);
  });

  it('no must_find expectations → recall_case is null (excluded from the average)', () => {
    const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 100]] }]);
    const expectation: EvalExpectation = {
      kind: 'must_not_flag',
      findings: [{ file: 'src/a.ts', start_line: 10, end_line: 10 }],
    };
    const produced: Finding[] = [];

    const result = scoreCase({ expectation, produced, dropped: 0, diff });
    expect(result.recall_case).toBeNull();
  });

  it('precision < 1 when a must_not_flag finding is produced', () => {
    const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 100]] }]);
    const expectation: EvalExpectation = {
      kind: 'must_not_flag',
      findings: [{ file: 'src/a.ts', start_line: 10, end_line: 10 }],
    };
    // The agent produced the forbidden finding — a false positive.
    const produced = [makeFinding({ file: 'src/a.ts', start_line: 10, end_line: 10 })];

    const result = scoreCase({ expectation, produced, dropped: 0, diff });
    expect(result.precision_case).toBeLessThan(1);
    expect(result.precision_case).toBe(0);
  });

  it('precision_case === 1 when all produced findings match expected must_find findings', () => {
    const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 100]] }]);
    const expectation: EvalExpectation = {
      kind: 'must_find',
      findings: [{ file: 'src/a.ts', start_line: 10, end_line: 10 }],
    };
    const produced = [makeFinding({ file: 'src/a.ts', start_line: 10, end_line: 10 })];

    const result = scoreCase({ expectation, produced, dropped: 0, diff });
    expect(result.precision_case).toBe(1);
  });

  it('precision_case === 1 when the case produces 0 findings (vacuous)', () => {
    const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 100]] }]);
    const expectation: EvalExpectation = {
      kind: 'must_find',
      findings: [{ file: 'src/a.ts', start_line: 10, end_line: 10 }],
    };
    const result = scoreCase({ expectation, produced: [], dropped: 0, diff });
    expect(result.precision_case).toBe(1);
  });

  describe('pass rule (AC-17)', () => {
    it('a must_find case with 1 expected + 1 matched, 0 extra produced findings passes', () => {
      const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 100]] }]);
      const expectation: EvalExpectation = {
        kind: 'must_find',
        findings: [{ file: 'src/a.ts', start_line: 10, end_line: 10 }],
      };
      const produced = [makeFinding({ file: 'src/a.ts', start_line: 10, end_line: 10 })];
      const result = scoreCase({ expectation, produced, dropped: 0, diff });
      expect(result.pass).toBe(true);
    });

    it('the same must_find case producing 0 findings (recall_case == 0) fails', () => {
      const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 100]] }]);
      const expectation: EvalExpectation = {
        kind: 'must_find',
        findings: [{ file: 'src/a.ts', start_line: 10, end_line: 10 }],
      };
      const result = scoreCase({ expectation, produced: [], dropped: 0, diff });
      expect(result.recall_case).toBe(0);
      expect(result.pass).toBe(false);
    });

    it('a must_not_flag case with the forbidden finding absent passes', () => {
      const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 100]] }]);
      const expectation: EvalExpectation = {
        kind: 'must_not_flag',
        findings: [{ file: 'src/a.ts', start_line: 10, end_line: 10 }],
      };
      const result = scoreCase({ expectation, produced: [], dropped: 0, diff });
      expect(result.pass).toBe(true);
    });

    it('a must_not_flag case with the forbidden finding present fails', () => {
      const diff = makeDiff([{ path: 'src/a.ts', lineRanges: [[1, 100]] }]);
      const expectation: EvalExpectation = {
        kind: 'must_not_flag',
        findings: [{ file: 'src/a.ts', start_line: 10, end_line: 10 }],
      };
      const produced = [makeFinding({ file: 'src/a.ts', start_line: 10, end_line: 10 })];
      const result = scoreCase({ expectation, produced, dropped: 0, diff });
      expect(result.pass).toBe(false);
    });
  });
});

describe('aggregateRun', () => {
  it('run recall 0.75 — two must_find cases at recall_case 0.5 and 1.0', () => {
    const caseResults = [
      { recall_case: 0.5, precision_case: 1, pass: false, kept: 1, dropped: 0 },
      { recall_case: 1.0, precision_case: 1, pass: true, kept: 1, dropped: 0 },
    ];
    const { recall } = aggregateRun(caseResults);
    expect(recall).toBe(0.75);
  });

  it('a run with no must_find case yields recall === 1 (vacuous)', () => {
    const caseResults = [
      { recall_case: null, precision_case: 1, pass: true, kept: 0, dropped: 0 },
      { recall_case: null, precision_case: 1, pass: true, kept: 0, dropped: 0 },
    ];
    const { recall } = aggregateRun(caseResults);
    expect(recall).toBe(1);
  });

  it('precision is the mean of precision_case over ALL cases', () => {
    const caseResults = [
      { recall_case: 1, precision_case: 1, pass: true, kept: 1, dropped: 0 },
      { recall_case: null, precision_case: 0, pass: false, kept: 1, dropped: 0 },
    ];
    const { precision } = aggregateRun(caseResults);
    expect(precision).toBe(0.5);
  });

  it('pooled citation_accuracy 0.75 — sum(kept)/(sum(kept)+sum(dropped)) across cases', () => {
    const caseResults = [
      { recall_case: 1, precision_case: 1, pass: true, kept: 2, dropped: 1 },
      { recall_case: null, precision_case: 1, pass: true, kept: 1, dropped: 0 },
    ];
    const { citation_accuracy } = aggregateRun(caseResults);
    expect(citation_accuracy).toBe(0.75);
  });

  it('citation_accuracy === 1 when the pool is empty (no kept, no dropped)', () => {
    const caseResults = [
      { recall_case: null, precision_case: 1, pass: true, kept: 0, dropped: 0 },
    ];
    const { citation_accuracy } = aggregateRun(caseResults);
    expect(citation_accuracy).toBe(1);
  });

  it('traces_passed / traces_total count over a mixed run', () => {
    const caseResults = [
      { recall_case: 1, precision_case: 1, pass: true, kept: 1, dropped: 0 },
      { recall_case: 0, precision_case: 1, pass: false, kept: 0, dropped: 0 },
      { recall_case: null, precision_case: 1, pass: true, kept: 0, dropped: 0 },
    ];
    const { traces_passed, traces_total } = aggregateRun(caseResults);
    expect(traces_passed).toBe(2);
    expect(traces_total).toBe(3);
  });
});
