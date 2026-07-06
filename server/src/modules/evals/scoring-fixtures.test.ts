import { describe, expect, it } from 'vitest';
import type { EvalExpectation, Finding, UnifiedDiff } from '@devdigest/shared';
import { aggregateRun, scoreCase } from './scoring.js';
import goodOutcome from './__fixtures__/good-prompt.outcome.json' with { type: 'json' };
import brokenOutcome from './__fixtures__/broken-prompt.outcome.json' with { type: 'json' };

/**
 * Prompt-sensitivity fixture test (AC-9, part of `verify:l06`).
 *
 * Scores the SAME small case set (one `must_find` case + one `must_not_flag`
 * case) against two real `ReviewOutcome` captures — one from a "good" system
 * prompt, one from a deliberately "broken" prompt — and asserts
 * recall/precision move in the expected direction. No Postgres, no Docker,
 * no API key, no network: the fixtures are hand-authored but FAITHFUL
 * `ReviewOutcome` JSON (see each fixture's `_fixture_note`), and the scorer
 * under test is the real, committed `scoring.ts` (`scoreCase`/`aggregateRun`)
 * — no mock LLM provider involved.
 *
 * Each fixture file holds TWO `ReviewOutcome` captures — `must_find` and
 * `must_not_flag` — one per eval case, mirroring AC-4 (a real eval run
 * invokes `reviewPullRequest` once per case over that case's own fixed
 * `input_diff`).
 *
 * Scenario: a PR adds a file-serving endpoint (`src/routes/files.ts`) with an
 * unsanitized path-traversal bug at lines 12-14, plus a harmless hardcoded
 * `ASSETS_ROOT` constant at line 5.
 *   - The GOOD capture's `must_find` outcome finds the path-traversal
 *     finding (recall 1, precision 1); its `must_not_flag` outcome raises
 *     nothing (precision 1).
 *   - The BROKEN capture's `must_find` outcome misses the path-traversal
 *     finding entirely (recall 0, precision 0); its `must_not_flag` outcome
 *     raises a false positive directly on the forbidden constant line
 *     (precision 0).
 */

const diff: UnifiedDiff = {
  raw: '',
  files: [
    {
      path: 'src/routes/files.ts',
      additions: 15,
      deletions: 0,
      hunks: [
        {
          file: 'src/routes/files.ts',
          oldStart: 1,
          oldLines: 0,
          newStart: 1,
          newLines: 15,
          newLineNumbers: Array.from({ length: 15 }, (_, i) => i + 1),
        },
      ],
    },
  ],
};

const mustFindCase: EvalExpectation = {
  kind: 'must_find',
  findings: [{ file: 'src/routes/files.ts', start_line: 12, end_line: 14 }],
};

const mustNotFlagCase: EvalExpectation = {
  kind: 'must_not_flag',
  findings: [{ file: 'src/routes/files.ts', start_line: 5, end_line: 5 }],
};

function findings(outcome: { review: { findings: unknown[] } }): Finding[] {
  return outcome.review.findings as Finding[];
}

describe('scoring-fixtures (AC-9 prompt sensitivity)', () => {
  it('good-prompt capture: must_find case passes (recall 1, precision 1)', () => {
    const produced = findings(goodOutcome.must_find);

    const result = scoreCase({
      expectation: mustFindCase,
      produced,
      dropped: goodOutcome.must_find.dropped.length,
      diff,
    });

    expect(result.recall_case).toBe(1);
    expect(result.precision_case).toBe(1);
    expect(result.pass).toBe(true);
  });

  it('good-prompt capture: must_not_flag case passes (the forbidden line is not raised)', () => {
    const produced = findings(goodOutcome.must_not_flag);

    const result = scoreCase({
      expectation: mustNotFlagCase,
      produced,
      dropped: goodOutcome.must_not_flag.dropped.length,
      diff,
    });

    expect(result.recall_case).toBeNull();
    expect(result.precision_case).toBe(1);
    expect(result.pass).toBe(true);
  });

  it('broken-prompt capture: must_find case fails (misses the expected finding entirely)', () => {
    const produced = findings(brokenOutcome.must_find);

    const result = scoreCase({
      expectation: mustFindCase,
      produced,
      dropped: brokenOutcome.must_find.dropped.length,
      diff,
    });

    expect(result.recall_case).toBe(0);
    expect(result.precision_case).toBe(0);
    expect(result.pass).toBe(false);
  });

  it('broken-prompt capture: must_not_flag case fails (raises the forbidden finding)', () => {
    const produced = findings(brokenOutcome.must_not_flag);

    const result = scoreCase({
      expectation: mustNotFlagCase,
      produced,
      dropped: brokenOutcome.must_not_flag.dropped.length,
      diff,
    });

    expect(result.recall_case).toBeNull();
    expect(result.precision_case).toBeLessThan(1);
    expect(result.pass).toBe(false);
  });

  it('run-level recall/precision move in the expected direction between good and broken (AC-9)', () => {
    const goodAggregate = aggregateRun([
      scoreCase({
        expectation: mustFindCase,
        produced: findings(goodOutcome.must_find),
        dropped: goodOutcome.must_find.dropped.length,
        diff,
      }),
      scoreCase({
        expectation: mustNotFlagCase,
        produced: findings(goodOutcome.must_not_flag),
        dropped: goodOutcome.must_not_flag.dropped.length,
        diff,
      }),
    ]);

    const brokenAggregate = aggregateRun([
      scoreCase({
        expectation: mustFindCase,
        produced: findings(brokenOutcome.must_find),
        dropped: brokenOutcome.must_find.dropped.length,
        diff,
      }),
      scoreCase({
        expectation: mustNotFlagCase,
        produced: findings(brokenOutcome.must_not_flag),
        dropped: brokenOutcome.must_not_flag.dropped.length,
        diff,
      }),
    ]);

    // AC-9: recall/precision move in the expected direction — the good
    // prompt's run scores strictly higher on both axes than the broken one.
    expect(goodAggregate.recall).toBeGreaterThan(brokenAggregate.recall);
    expect(goodAggregate.precision).toBeGreaterThan(brokenAggregate.precision);
    expect(goodAggregate.recall).toBe(1);
    expect(brokenAggregate.recall).toBe(0);
    expect(goodAggregate.precision).toBe(1);
    expect(brokenAggregate.precision).toBe(0);
    expect(goodAggregate.traces_passed).toBe(2);
    expect(brokenAggregate.traces_passed).toBe(0);
  });
});
