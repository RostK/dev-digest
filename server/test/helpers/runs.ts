import * as t from '../../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { PgFixture } from './pg.js';

/**
 * `runReview` is fire-and-forget: the POST returns runIds immediately and each
 * agent's review is persisted in the background (the client subscribes to SSE).
 * Tests that assert on persisted reviews/findings/traces must first wait for the
 * background runs to finish. This polls `agent_runs` until every row for the PR
 * reaches a terminal status (done / failed / cancelled).
 *
 * On timeout it THROWS rather than returning the (still-running) rows: a silent
 * return let a slow run masquerade as a data bug downstream — the caller would
 * read a not-yet-persisted trace and see `GET /runs/:id/trace` 404 → e.g.
 * `specs_read` undefined — instead of a clear "run didn't settle in time". The
 * default budget is generous because these background reviews run on a loaded CI
 * box / Docker Postgres and routinely need >10s; bump `timeoutMs` further for a
 * test that fans out many concurrent runs.
 */
const TERMINAL = new Set(['done', 'failed', 'cancelled']);

export async function waitForPrRuns(
  db: PgFixture['handle']['db'],
  prId: string,
  opts: { expected?: number; timeoutMs?: number } = {},
): Promise<Array<typeof t.agentRuns.$inferSelect>> {
  const { expected, timeoutMs = 30_000 } = opts;
  const start = Date.now();
  for (;;) {
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));
    const terminal = runs.filter((r) => TERMINAL.has(r.status ?? ''));
    // With an explicit `expected`, wait until that many runs finish (ignores any
    // extra rows, e.g. a trifecta scan). Otherwise wait for all rows to settle.
    const done =
      expected != null
        ? terminal.length >= expected
        : runs.length > 0 && terminal.length === runs.length;
    if (done) return runs;
    if (Date.now() - start > timeoutMs) {
      const want = expected != null ? `${expected} terminal run(s)` : `all ${runs.length} run(s) terminal`;
      throw new Error(
        `waitForPrRuns: PR ${prId} did not settle within ${timeoutMs}ms ` +
          `(wanted ${want}; have ${terminal.length}/${runs.length} terminal, ` +
          `statuses=[${runs.map((r) => r.status ?? 'null').join(', ')}]).`,
      );
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}
