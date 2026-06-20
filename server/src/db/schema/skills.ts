import { pgTable, uuid, text, integer, boolean, jsonb, primaryKey, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  // Optional repo scope. NULL = global (rubrics/security/generic, the default);
  // set = pinned to that repo (e.g. extracted conventions). The review prompt
  // only feeds a pinned skill when reviewing that repo (enabledSkillBodies). On
  // repo delete the pinned skill is removed (cascade) rather than silently
  // becoming global (which would re-introduce cross-repo leakage).
  repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
  source: text('source', {
    enum: ['manual', 'imported_url', 'extracted', 'community'],
  }).notNull(),
  body: text('body').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  version: integer('version').notNull().default(1),
  evidenceFiles: jsonb('evidence_files').$type<string[]>(),
  createdAt: now(),
}, (t) => ({
  // repo_id is JOINed + filtered on the hot review path (enabledSkillBodies) and
  // an unindexed FK also slows parent-repo cascade deletes. (FK ≠ index in PG.)
  repoIdx: index('skills_repo_idx').on(t.repoId),
}));

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);
