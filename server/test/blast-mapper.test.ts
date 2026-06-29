import { describe, it, expect } from 'vitest';
import { mapToBlastRadius } from '../src/modules/blast/mapper.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

/**
 * Pure mapping from the facade's flat `BlastResult` to the nested `BlastRadius`
 * HTTP contract: grouping callers by `viaSymbol`, attributing endpoints/crons
 * per symbol from `factsByFile`, and the degraded-path fallback.
 */

const PERSISTENT: BlastResult = {
  changedSymbols: [
    { file: 'src/lib/rate.ts', name: 'rateLimit', kind: 'function' },
    { file: 'src/lib/rate.ts', name: 'bucketKey', kind: 'function' },
  ],
  callers: [
    { file: 'src/api/public/index.ts', symbol: 'handler', viaSymbol: 'rateLimit', line: 23, rank: 9 },
    { file: 'src/api/public/webhooks.ts', symbol: 'onWebhook', viaSymbol: 'rateLimit', line: 45, rank: 7 },
    { file: 'src/lib/rate.ts', symbol: 'rateLimit', viaSymbol: 'bucketKey', line: 12, rank: 5 },
  ],
  impactedEndpoints: ['GET /api/public/items', 'POST /api/public/webhooks'],
  factsByFile: {
    'src/api/public/index.ts': { endpoints: ['GET /api/public/items'], crons: [] },
    'src/api/public/webhooks.ts': {
      endpoints: ['POST /api/public/webhooks'],
      crons: ['reset-rate-buckets (hourly)'],
    },
    'src/lib/rate.ts': { endpoints: [], crons: [] },
  },
  degraded: false,
};

describe('mapToBlastRadius', () => {
  it('groups callers by viaSymbol and maps caller fields', () => {
    const out = mapToBlastRadius(PERSISTENT, 'summary text');

    expect(out.summary).toBe('summary text');
    expect(out.changed_symbols).toEqual([
      { name: 'rateLimit', file: 'src/lib/rate.ts', kind: 'function' },
      { name: 'bucketKey', file: 'src/lib/rate.ts', kind: 'function' },
    ]);

    const rate = out.downstream.find((d) => d.symbol === 'rateLimit')!;
    expect(rate.callers).toEqual([
      { name: 'handler', file: 'src/api/public/index.ts', line: 23 },
      { name: 'onWebhook', file: 'src/api/public/webhooks.ts', line: 45 },
    ]);
    expect(rate.callers).toHaveLength(2); // acceptance: ≥2 callers
  });

  it('attributes endpoints + crons per symbol from factsByFile', () => {
    const out = mapToBlastRadius(PERSISTENT, 's');
    const rate = out.downstream.find((d) => d.symbol === 'rateLimit')!;

    expect(rate.endpoints_affected.sort()).toEqual([
      'GET /api/public/items',
      'POST /api/public/webhooks',
    ]);
    expect(rate.endpoints_affected.length).toBeGreaterThanOrEqual(1); // acceptance: ≥1 endpoint
    expect(rate.crons_affected).toEqual(['reset-rate-buckets (hourly)']);

    const bucket = out.downstream.find((d) => d.symbol === 'bucketKey')!;
    expect(bucket.endpoints_affected).toEqual([]); // its caller file has no facts
  });

  it('falls back to the flat endpoint union when factsByFile is absent (degraded)', () => {
    const degraded: BlastResult = {
      ...PERSISTENT,
      factsByFile: undefined,
      degraded: true,
      reason: 'no_data',
    };
    const out = mapToBlastRadius(degraded, 's');

    for (const d of out.downstream) {
      expect(d.endpoints_affected).toEqual([
        'GET /api/public/items',
        'POST /api/public/webhooks',
      ]);
      expect(d.crons_affected).toEqual([]);
    }
  });

  it('produces no downstream entries for a symbol with no callers', () => {
    const out = mapToBlastRadius(
      { changedSymbols: [{ file: 'a.ts', name: 'lonely', kind: 'function' }], callers: [], impactedEndpoints: [] },
      's',
    );
    expect(out.changed_symbols).toHaveLength(1);
    expect(out.downstream).toHaveLength(0);
  });
});
