import { pgTable, uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';

// ============================================================ Observability

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
  prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
  // Links this run to the multi-run that fanned it out (Multi-Agent Review,
  // SPEC-06). Nullable — a single-agent (non-multi-run) execution leaves this
  // unset. `set null` so deleting a multi_agent_runs row never cascades into
  // deleting the underlying agent_runs history.
  multiAgentRunId: uuid('multi_agent_run_id').references(() => multiAgentRuns.id, {
    onDelete: 'set null',
  }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  provider: text('provider'),
  model: text('model'),
  durationMs: integer('duration_ms'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  status: text('status'),
  /** Failure reason when status='failed' (LLM/API error, timeout, quota, …). */
  error: text('error'),
  source: text('source', { enum: ['local', 'ci'] }).notNull().default('local'),
  findingsCount: integer('findings_count'),
  grounding: text('grounding'),
  /** Review score (0-100) for this run; null on failed/cancelled runs. */
  score: integer('score'),
  /** Findings that tripped the agent's gate (severity ≥ ciFailOn). */
  blockers: integer('blockers'),
}, (t) => ({
  // Serves prId-scoped reads — especially the pulls-list "latest 'done' run per
  // PR" lookup (DISTINCT ON pr_id … WHERE status='done' ORDER BY pr_id, ran_at
  // DESC). With status as an equality middle column, this also supports the
  // (pr_id, ran_at) ordering. agent_runs had no pr_id index before.
  prStatusRanAtIdx: index('agent_runs_pr_status_ran_at_idx').on(t.prId, t.status, t.ranAt),
  // Postgres does NOT auto-index a foreign key's REFERENCING column — this
  // serves the "linked agent_runs for a multi-run" read (getLinkedAgentRuns).
  // Leads with the join key (server/INSIGHTS.md 2026-06-17).
  multiAgentRunIdIdx: index('agent_runs_multi_agent_run_id_idx').on(t.multiAgentRunId),
}));

/** Whole trace of one run as a SINGLE jsonb document. */
export const runTraces = pgTable('run_traces', {
  runId: uuid('run_id')
    .primaryKey()
    .references(() => agentRuns.id, { onDelete: 'cascade' }),
  trace: jsonb('trace').notNull(),
});

export const multiAgentRuns = pgTable('multi_agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
  // The PRE-RUN estimate (per-agent + summary time·cost), captured at launch —
  // calibration data for estimate-accuracy tracking (SPEC-06 AC-22). Nullable:
  // shape is the `MultiAgentEstimate` contract, but this column is unconstrained
  // jsonb, so a read MUST `MultiAgentEstimate.safeParse(row.estimate)`, never
  // `as MultiAgentEstimate` (server/INSIGHTS.md 2026-07-03). The actual outcome
  // (per-agent + total duration·cost) is NOT stored here — it is derived at
  // read time from the linked `agent_runs` (cost-at-read pattern).
  estimate: jsonb('estimate'),
});
