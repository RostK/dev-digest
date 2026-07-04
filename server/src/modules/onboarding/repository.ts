import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { ONBOARDING_JOB_KIND } from './constants.js';

/**
 * Onboarding data-access. Owns the `onboarding` row (repo_id PK) and reads/
 * writes `jobs` rows scoped to `ONBOARDING_JOB_KIND`. Also resolves the
 * owning repo's identity with a workspace-scoped read of `repos` — the same
 * cross-module pattern conventions/reviews/pulls use (this module's OWN
 * repository, never a sibling's `RepoRepository`).
 */

export type RepoRow = typeof t.repos.$inferSelect;
export type OnboardingRow = typeof t.onboarding.$inferSelect;
export type JobRow = typeof t.jobs.$inferSelect;

export class OnboardingRepository {
  constructor(private db: Db) {}

  /** The repo, scoped to the workspace — the IDOR guard for every HTTP-facing call (AC-17). */
  async getRepoInWorkspace(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /**
   * Unscoped repo basics for the BACKGROUND job handler. `JobHandler`'s ctx
   * carries only `{ jobId }` (no workspaceId — see platform/jobs.ts), and the
   * queued payload only ever carries a trusted `repoId` (tenancy was already
   * enforced upstream, in `enqueueGeneration` / `maybeEnqueueRegen`, before
   * the job was enqueued) — mirrors repo-intel's own job-handler reads.
   */
  async getRepoBasics(repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  async getTour(repoId: string): Promise<OnboardingRow | undefined> {
    const [row] = await this.db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repoId));
    return row;
  }

  /** Upsert the repo's ONE tour row (PK = repoId) — a regenerate replaces it whole (AC-9). */
  async upsertTour(repoId: string, json: unknown, generatedAt: Date): Promise<OnboardingRow> {
    const [row] = await this.db
      .insert(t.onboarding)
      .values({ repoId, json: json as object, generatedAt })
      .onConflictDoUpdate({
        target: t.onboarding.repoId,
        set: { json: json as object, generatedAt },
      })
      .returning();
    return row!;
  }

  /** One job by id, scoped to the workspace + this module's kind (AC-17). */
  async getJob(workspaceId: string, jobId: string): Promise<JobRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.jobs)
      .where(
        and(
          eq(t.jobs.workspaceId, workspaceId),
          eq(t.jobs.id, jobId),
          eq(t.jobs.kind, ONBOARDING_JOB_KIND),
        ),
      );
    return row;
  }

  /**
   * The latest onboarding job for a repo (ANY status — including `failed`, so
   * the tour envelope can surface a failure, not just an in-flight one).
   */
  async latestOnboardingJob(workspaceId: string, repoId: string): Promise<JobRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.jobs)
      .where(
        and(
          eq(t.jobs.workspaceId, workspaceId),
          eq(t.jobs.kind, ONBOARDING_JOB_KIND),
          sql`${t.jobs.payload} ->> 'repoId' = ${repoId}`,
        ),
      )
      .orderBy(desc(t.jobs.scheduledAt))
      .limit(1);
    return row;
  }

  /**
   * A queued/running onboarding job already in flight for the repo — the
   * de-dupe check before enqueueing (manual Regenerate or the auto-regen
   * hook), so overlapping triggers don't pile up LLM calls.
   */
  async findInFlightRegen(repoId: string): Promise<JobRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.jobs)
      .where(
        and(
          eq(t.jobs.kind, ONBOARDING_JOB_KIND),
          inArray(t.jobs.status, ['queued', 'running']),
          sql`${t.jobs.payload} ->> 'repoId' = ${repoId}`,
        ),
      )
      .limit(1);
    return row;
  }

  /** On boot: any onboarding job left 'running' by a dead process is orphaned. */
  async reapStale(): Promise<number> {
    const rows = await this.db
      .update(t.jobs)
      .set({ status: 'failed', finishedAt: new Date(), error: 'orphaned: reaped on boot' })
      .where(and(eq(t.jobs.kind, ONBOARDING_JOB_KIND), eq(t.jobs.status, 'running')))
      .returning({ id: t.jobs.id });
    return rows.length;
  }
}
