import { describe, it, expect, vi } from 'vitest';
import { deterministicSummary, summarize } from '../src/modules/blast/summary.js';
import type { Container } from '../src/platform/container.js';
import type { BlastResult } from '../src/modules/repo-intel/types.js';

const MAP: BlastResult = {
  changedSymbols: [
    { file: 'a.ts', name: 'foo', kind: 'function' },
    { file: 'a.ts', name: 'bar', kind: 'function' },
  ],
  callers: [
    { file: 'b.ts', symbol: 'x', viaSymbol: 'foo', line: 1, rank: 1 },
    { file: 'c.ts', symbol: 'y', viaSymbol: 'foo', line: 2, rank: 1 },
  ],
  impactedEndpoints: ['GET /a'],
};

/** Build a fake Container exposing only what summarize() touches: `llm`. */
function fakeContainer(llm: unknown): Container {
  return { llm: async () => llm } as unknown as Container;
}

describe('deterministicSummary', () => {
  it('renders pluralized counts', () => {
    expect(deterministicSummary(MAP)).toBe(
      '2 changed symbols with 2 callers across 1 impacted endpoint.',
    );
  });
});

describe('summarize', () => {
  it('uses the model text on success and calls the model exactly once', async () => {
    const complete = vi.fn().mockResolvedValue({ text: '  These changes ripple downstream.  ' });
    const out = await summarize(fakeContainer({ complete }), MAP);
    expect(out).toBe('These changes ripple downstream.');
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('falls back to the deterministic summary when the model throws', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('no ANTHROPIC_API_KEY'));
    const out = await summarize(fakeContainer({ complete }), MAP);
    expect(out).toBe(deterministicSummary(MAP));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('falls back when the model returns empty text', async () => {
    const complete = vi.fn().mockResolvedValue({ text: '   ' });
    const out = await summarize(fakeContainer({ complete }), MAP);
    expect(out).toBe(deterministicSummary(MAP));
  });

  it('never calls the model for an empty map', async () => {
    const complete = vi.fn();
    const empty: BlastResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };
    const out = await summarize(fakeContainer({ complete }), empty);
    expect(out).toBe(deterministicSummary(empty));
    expect(complete).not.toHaveBeenCalled();
  });
});
