import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    // Provenance: the finding this case was derived from (create-from-finding
    // flow). Nullable — scaffolded/manual cases have no source finding. NOT a
    // real FK (a deleted review cascades its findings away, but the derived
    // eval case must outlive them — it's the whole point of capturing it).
    findingId: uuid('finding_id'),
  },
  (t) => ({
    // Supports `listCasesForAgent` (and the skill-owner equivalent): every case
    // list/read is scoped by (owner_kind, owner_id). owner_id is NOT a real FK
    // (polymorphic — points at either agents or skills) so Postgres would never
    // auto-index it; without this the lookup seq-scans eval_cases as it grows.
    ownerIdx: index('eval_cases_owner_idx').on(t.ownerKind, t.ownerId),
    // One eval case per source finding — the DB-level dedup behind the
    // idempotent create-from-finding flow (a repeat click must return the
    // existing case, never mint a duplicate). Postgres unique treats NULLs as
    // distinct, so cases with no source finding are unaffected.
    findingUq: uniqueIndex('eval_cases_finding_uq').on(t.findingId),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    // Raw grounding counts for THIS case's review pass. `citation_accuracy`
    // above is the per-case ratio kept/(kept+dropped); these columns preserve
    // the underlying counts so the GROUP-level citation_accuracy can be POOLED
    // (sum(kept)/sum(kept+dropped)) per AC-7 rather than averaged from the
    // per-case ratios (a mean of ratios ≠ the pooled ratio when denominators
    // differ). Nullable: legacy/pre-0019 rows have no counts.
    kept: integer('kept'),
    dropped: integer('dropped'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    // SPEC-05 T3 — one "run group" = a full eval-suite execution against a
    // single agent version; all cases for that owner run together at one
    // ran_at, sharing this id. Nullable: a case can still carry a legacy/ad-hoc
    // single run with no group. NOT a real FK (no `eval_run_groups` table — the
    // group is a value object, not a row) so it needs an explicit index for the
    // group-aggregate reads (getGroup / dashboard rollups).
    groupId: uuid('group_id'),
    // Snapshot of the agent's config AT RUN TIME (read once at the top of
    // runSet), so a mid-run edit to the live agent row can never leak into an
    // already-in-flight run's persisted results — see server/INSIGHTS.md.
    agentVersion: integer('agent_version'),
    systemPrompt: text('system_prompt'),
  },
  (t) => ({
    groupIdx: index('eval_runs_group_idx').on(t.groupId),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
