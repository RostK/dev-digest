import { describe, it, expect, vi } from 'vitest';
import { JobRunner } from '../src/platform/jobs.js';
import type { Db } from '../src/db/client.js';

/**
 * Minimal fake Drizzle db: only the `insert().values().returning()` and
 * `update().set().where()` chains JobRunner actually calls. `sets` records
 * every `.set(...)` payload in order so a test can assert the job's final
 * status transition without a real Postgres.
 */
function fakeDb(): { db: Db; sets: Array<Record<string, unknown>> } {
  const sets: Array<Record<string, unknown>> = [];
  let counter = 0;
  const db = {
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: `job-${++counter}` }],
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        sets.push(values);
        return { where: async () => undefined };
      },
    }),
  };
  return { db: db as unknown as Db, sets };
}

describe('JobRunner completion hooks', () => {
  it('fires a registered hook exactly once after the job reaches done, with ctx + payload', async () => {
    const { db } = fakeDb();
    const runner = new JobRunner(db);
    runner.register('demo', async () => {});

    const calls: Array<{
      payload: unknown;
      ctx: { jobId: string; workspaceId: string; kind: string };
    }> = [];
    runner.onCompleted('demo', async (payload, ctx) => {
      calls.push({ payload, ctx });
    });

    const payload = { foo: 'bar' };
    const enqueued = await runner.enqueue('workspace-1', 'demo', payload);
    await enqueued.done;

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      payload,
      ctx: { jobId: enqueued.id, workspaceId: 'workspace-1', kind: 'demo' },
    });
  });

  it('swallows a throwing hook: job still ends done, and a second hook for the same kind still runs', async () => {
    const { db, sets } = fakeDb();
    const runner = new JobRunner(db);
    runner.register('demo', async () => {});

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let secondHookCalled = false;
    runner.onCompleted('demo', async () => {
      throw new Error('boom');
    });
    runner.onCompleted('demo', async () => {
      secondHookCalled = true;
    });

    const enqueued = await runner.enqueue('workspace-1', 'demo', {});
    await expect(enqueued.done).resolves.toBeUndefined();

    expect(secondHookCalled).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();

    // The job itself must have ended `done`, never `failed` — a throwing
    // hook must not reopen/affect the job it observes.
    expect(sets.some((s) => s.status === 'done')).toBe(true);
    expect(sets.some((s) => s.status === 'failed')).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  it('does not fire hooks registered for a different kind', async () => {
    const { db } = fakeDb();
    const runner = new JobRunner(db);
    runner.register('demo', async () => {});
    runner.register('other', async () => {});

    let otherHookCalled = false;
    runner.onCompleted('other', async () => {
      otherHookCalled = true;
    });

    const enqueued = await runner.enqueue('workspace-1', 'demo', {});
    await enqueued.done;

    expect(otherHookCalled).toBe(false);
  });
});
