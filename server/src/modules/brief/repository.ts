import { eq } from 'drizzle-orm';
import type { Brief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Brief data-access. Owns ONLY the `pr_brief` table (`prId` PK/FK cascade to
 * `pull_requests`, `json` jsonb notNull, NO `workspace_id`, NO `generated_at`
 * column — `generated_at` is stamped INSIDE the json blob by the service).
 * Drizzle for this table lives here only. Tenancy is enforced by the SERVICE
 * (resolve the PR in-workspace via `container.reviewRepo.getPull` first), not
 * here — this repository is PR-id-scoped, same shape as `pr_intent`.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  async getBrief(prId: string): Promise<Brief | null> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return (row?.json as Brief | undefined) ?? null;
  }

  /** Always overwrite (AC-6: an explicit Regenerate always wins) — the good-brief path. */
  async upsertBrief(prId: string, brief: Brief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }

  /**
   * Insert ONLY if no row exists yet for this PR — the degraded-generation
   * path (AC-8). `ON CONFLICT DO NOTHING … RETURNING` makes the no-clobber
   * check ATOMIC at the database: a concurrent POST can no longer race a
   * read-then-write window (fixes the prior read-`existing`-then-conditionally-
   * upsert TOCTOU in the service). Returns whether a row was actually written.
   */
  async insertBriefIfAbsent(prId: string, brief: Brief): Promise<boolean> {
    const rows = await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoNothing({ target: t.prBrief.prId })
      .returning({ prId: t.prBrief.prId });
    return rows.length > 0;
  }
}
