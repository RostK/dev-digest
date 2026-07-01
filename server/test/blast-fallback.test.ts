import { describe, it, expect } from 'vitest';
import { buildFallbackResult, FALLBACK_MAX_CALLERS_PER_SYMBOL } from '../src/modules/blast/fallback.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

const BASE: BlastResult = {
  changedSymbols: [
    { file: 'src/lib/rate.ts', name: 'rateLimit', kind: 'function' },
    { file: 'src/lib/rate.ts', name: 'bucketKey', kind: 'function' },
  ],
  callers: [],
  impactedEndpoints: [],
  degraded: false,
};

describe('buildFallbackResult', () => {
  it('groups name-matched callers by viaSymbol and attributes facts', () => {
    const out = buildFallbackResult(
      BASE,
      [
        { file: 'src/api/index.ts', toSymbol: 'rateLimit', line: 23, rank: 9 },
        { file: 'src/api/webhooks.ts', toSymbol: 'rateLimit', line: 45, rank: 7 },
        { file: 'src/lib/rate.ts', toSymbol: 'bucketKey', line: 12, rank: 5 },
      ],
      [
        { filePath: 'src/api/index.ts', endpoints: ['GET /api/items'], crons: [] },
        { filePath: 'src/api/webhooks.ts', endpoints: ['POST /api/webhooks'], crons: ['nightly'] },
      ],
    );

    expect(out.callers).toHaveLength(3);
    const rate = out.callers.filter((c) => c.viaSymbol === 'rateLimit');
    expect(rate.map((c) => `${c.file}:${c.line}`)).toEqual([
      'src/api/index.ts:23',
      'src/api/webhooks.ts:45',
    ]);
    expect(out.impactedEndpoints.sort()).toEqual(['GET /api/items', 'POST /api/webhooks']);
    expect(out.factsByFile?.['src/api/webhooks.ts']?.crons).toEqual(['nightly']);
    // changed symbols carried through unchanged
    expect(out.changedSymbols).toBe(BASE.changedSymbols);
  });

  it('caps callers per symbol at the shared limit', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      file: `src/c${i}.ts`,
      toSymbol: 'rateLimit',
      line: i + 1,
      rank: 30 - i,
    }));
    const out = buildFallbackResult(BASE, rows, []);
    expect(out.callers).toHaveLength(FALLBACK_MAX_CALLERS_PER_SYMBOL);
  });

  it('returns empty callers when nothing name-matched', () => {
    const out = buildFallbackResult(BASE, [], []);
    expect(out.callers).toEqual([]);
    expect(out.impactedEndpoints).toEqual([]);
  });
});
