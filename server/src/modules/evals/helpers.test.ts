import { describe, it, expect } from 'vitest';
import { mapWithConcurrency, withTimeout } from './helpers.js';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('mapWithConcurrency', () => {
  it('preserves INPUT order in the results regardless of completion order', async () => {
    const items = [30, 5, 20, 1, 15];
    // Later items resolve sooner (inverse delay), so completion order ≠ input order.
    const out = await mapWithConcurrency(items, 3, async (v) => {
      await delay(v);
      return v * 2;
    });
    expect(out).toEqual([60, 10, 40, 2, 30]);
  });

  it('never runs more than `limit` tasks at once', async () => {
    let active = 0;
    let maxActive = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      active--;
    });
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(maxActive).toBeGreaterThan(1); // actually parallel, not serialized
  });

  it('is a no-op on an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});

describe('withTimeout', () => {
  it('passes through a value that settles in time', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'op')).resolves.toBe('ok');
  });

  it('rejects when the promise does not settle within the budget', async () => {
    const never = new Promise<string>(() => {}); // never settles
    await expect(withTimeout(never, 20, 'stuck-op')).rejects.toThrow(/stuck-op timed out after 20ms/);
  });
});
