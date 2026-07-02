import PQueue from 'p-queue';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as t from '../db/schema.js';
import { withTimeout, withRetry } from './resilience.js';

/**
 * JobRunner — async work (clone, PR import, indexing, polling) on a
 * concurrency-limited p-queue, mirrored into the `jobs` table with
 * timeouts + retry/backoff.
 *
 * Handlers are registered by kind. enqueue() inserts a `jobs` row, schedules
 * the handler on the queue, and updates status/attempts/error as it runs.
 */

export type JobHandler = (payload: unknown, ctx: { jobId: string }) => Promise<void>;

/**
 * Fired after a job reaches `done`. FAIL-SOFT by design: a hook that throws
 * is caught + logged by the runner and never affects the job's own status —
 * see the invocation site in `enqueue()`.
 */
export type JobCompletionHook = (
  payload: unknown,
  ctx: { jobId: string; workspaceId: string; kind: string },
) => Promise<void>;

export interface JobRunnerOptions {
  concurrency?: number;
  timeoutMs?: number;
  retries?: number;
}

export interface EnqueuedJob {
  id: string;
  /** Resolves when the job finishes (or rejects if it ultimately fails). */
  done: Promise<void>;
}

export class JobRunner {
  private queue: PQueue;
  private handlers = new Map<string, JobHandler>();
  private completionHooks = new Map<string, JobCompletionHook[]>();
  private timeoutMs: number;
  private retries: number;

  constructor(
    private db: Db,
    opts: JobRunnerOptions = {},
  ) {
    this.queue = new PQueue({ concurrency: opts.concurrency ?? 3 });
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.retries = opts.retries ?? 2;
  }

  register(kind: string, handler: JobHandler): void {
    this.handlers.set(kind, handler);
  }

  /**
   * Register a completion hook for a job kind. Symmetric to `register()`.
   * Multiple hooks per kind are allowed and run in registration order, each
   * isolated in its own try/catch (see the invocation site in `enqueue()`).
   */
  onCompleted(kind: string, hook: JobCompletionHook): void {
    const hooks = this.completionHooks.get(kind);
    if (hooks) hooks.push(hook);
    else this.completionHooks.set(kind, [hook]);
  }

  async enqueue(workspaceId: string, kind: string, payload: unknown): Promise<EnqueuedJob> {
    const handler = this.handlers.get(kind);
    if (!handler) throw new Error(`No job handler registered for kind '${kind}'`);

    const [row] = await this.db
      .insert(t.jobs)
      .values({ workspaceId, kind, payload: payload as object, status: 'queued' })
      .returning({ id: t.jobs.id });
    const jobId = row!.id;

    const done = this.queue.add(async () => {
      await this.db
        .update(t.jobs)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(t.jobs.id, jobId));
      try {
        await withRetry(
          () =>
            withTimeout(handler(payload, { jobId }), this.timeoutMs).then(async () => {
              await this.db
                .update(t.jobs)
                .set({ attempts: 1 })
                .where(eq(t.jobs.id, jobId));
            }),
          {
            retries: this.retries,
            onRetry: async (attempt) => {
              await this.db
                .update(t.jobs)
                .set({ attempts: attempt })
                .where(eq(t.jobs.id, jobId));
            },
          },
        );
        await this.db
          .update(t.jobs)
          .set({ status: 'done', finishedAt: new Date() })
          .where(eq(t.jobs.id, jobId));

        await this.runCompletionHooks(kind, payload, { jobId, workspaceId, kind });
      } catch (err) {
        await this.db
          .update(t.jobs)
          .set({
            status: 'failed',
            finishedAt: new Date(),
            error: (err as Error).message,
          })
          .where(eq(t.jobs.id, jobId));
        throw err;
      }
    }) as Promise<void>;

    return { id: jobId, done };
  }

  /** Wait for the queue to drain (useful in tests). */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }

  /**
   * Invoke every completion hook registered for `kind`, FAIL-SOFT: each call
   * is isolated in its own try/catch so a throwing hook is logged and never
   * rethrown — it must not affect the job's `done` status nor block sibling
   * hooks for the same kind.
   */
  private async runCompletionHooks(
    kind: string,
    payload: unknown,
    ctx: { jobId: string; workspaceId: string; kind: string },
  ): Promise<void> {
    const hooks = this.completionHooks.get(kind);
    if (!hooks || hooks.length === 0) return;
    for (const hook of hooks) {
      try {
        await hook(payload, ctx);
      } catch (err) {
        console.error(`[jobs] completion hook for kind '${kind}' threw (job ${ctx.jobId}):`, err);
      }
    }
  }
}
