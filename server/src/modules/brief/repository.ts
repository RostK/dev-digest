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

  async upsertBrief(prId: string, brief: Brief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
