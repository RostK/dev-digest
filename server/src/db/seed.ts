import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  TEST_QUALITY_SKILL_BODY,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files — the 9 changed files with real unified-diff patches, so the
    // diff renders and the Smart Diff click-to-line lands on a real line. The
    // +/- stats are GitHub's totals; each `patch` is a representative subset.
    // CRITICAL for the demo: config.ts's patch contains new line 12 (the seeded
    // CRITICAL finding) and users.ts's contains new lines 45–52 (the WARNING).
    await db.insert(t.prFiles).values([
      // ---- core (business logic) ----
      {
        prId: pr!.id,
        path: 'src/middleware/ratelimit.ts',
        additions: 84,
        deletions: 0,
        patch: [
          '@@ -22,0 +23,11 @@ import { redis } from "../redis";',
          '+',
          '+export async function rateLimit(req: Req, res: Res, next: Next) {',
          '+  const key = bucketKey(req);',
          '+  const count = await redis.incr(key);',
          '+  if (count === 1) await redis.expire(key, 3600);',
          '+  if (count > limitFor(req)) {',
          '+    return res.status(429).end();',
          '+  }',
          '+  return next();',
          '+}',
        ].join('\n'),
      },
      {
        prId: pr!.id,
        path: 'src/api/public/webhooks.ts',
        additions: 31,
        deletions: 6,
        patch: [
          '@@ -58,3 +58,5 @@ export async function webhookHandler(req: Req, res: Res) {',
          '   const target = req.body.callback_url;',
          '   const account = await db.accounts.find(req.accountId);',
          '+  const token = account.apiToken;',
          '+  await fetch(target, { headers: { Authorization: token } });',
          '   return res.status(202).end();',
          ' }',
        ].join('\n'),
      },
      {
        prId: pr!.id,
        path: 'src/api/users.ts',
        additions: 7,
        deletions: 2,
        patch: [
          '@@ -42,5 +43,10 @@ export async function listUsers(req: Req, res: Res) {',
          '   const users = await db.users.findMany();',
          '   const result = [];',
          '-  for (const u of users) result.push(u);',
          '-  return res.json(result);',
          '+  for (const u of users) {',
          '+    // N+1: a query per user under the new limiter',
          '+    const orders = await db.orders.findByUser(u.id);',
          '+    result.push({ ...u, orders });',
          '+  }',
          '+  return res.json(result);',
          '+  // rate limiter applied upstream',
        ].join('\n'),
      },
      // ---- wiring (hooks the core into the app) ----
      {
        prId: pr!.id,
        path: 'src/config.ts',
        additions: 4,
        deletions: 0,
        patch: [
          '@@ -9,3 +9,7 @@ export const config = {',
          '   port: Number(process.env.PORT ?? 3000),',
          '   redisUrl: process.env.REDIS_URL,',
          '+  // payments',
          '+  stripeKey: "sk_live_51H8xq2Ka9Vn3PqLm7Rd0bZ4Xc",',
          '+  rateLimit: { windowMs: 60000, max: 100 },',
          '+  enableWebhooks: true,',
          ' };',
        ].join('\n'),
      },
      {
        prId: pr!.id,
        path: 'src/server.ts',
        additions: 8,
        deletions: 1,
        patch: [
          '@@ -8,2 +8,9 @@ const app = Fastify();',
          '   import { config } from "./config";',
          '-app.listen({ port: 3000 });',
          '+app.register(rateLimit);',
          '+app.register(publicApi);',
          '+app.listen({ port: config.port }, (err) => {',
          '+  if (err) {',
          '+    app.log.error(err);',
          '+    process.exit(1);',
          '+  }',
          '+  app.log.info("listening on " + config.port);',
          '+});',
        ].join('\n'),
      },
      {
        prId: pr!.id,
        path: 'src/api/public/index.ts',
        additions: 12,
        deletions: 2,
        patch: [
          '@@ -1,2 +1,12 @@',
          '-export { webhookHandler } from "./webhooks";',
          '-export { listUsers } from "../users";',
          '+import { Router } from "../../router";',
          '+import { rateLimit } from "../../middleware/ratelimit";',
          '+import { webhookHandler } from "./webhooks";',
          '+import { listUsers } from "../users";',
          '+',
          '+export const publicApi = new Router();',
          '+publicApi.use(rateLimit);',
          '+publicApi.post("/webhooks", webhookHandler);',
          '+publicApi.get("/users", listUsers);',
          '+',
          '+export { webhookHandler, listUsers };',
        ].join('\n'),
      },
      // ---- boilerplate (generated / mechanical — skim) ----
      {
        prId: pr!.id,
        path: 'package.json',
        additions: 3,
        deletions: 1,
        patch: [
          '@@ -12,4 +12,6 @@',
          '   "dependencies": {',
          '-    "fastify": "^5.1.0"',
          '+    "fastify": "^5.2.0",',
          '+    "ioredis": "^5.4.1",',
          '+    "rate-limiter-flexible": "^5.0.3"',
          '   }',
        ].join('\n'),
      },
      {
        prId: pr!.id,
        path: 'package-lock.json',
        additions: 92,
        deletions: 24,
        patch: [
          '@@ -338,6 +338,20 @@',
          '     "node_modules/fastify": {',
          '-      "version": "5.1.0"',
          '+      "version": "5.2.0"',
          '     },',
          '+    "node_modules/ioredis": {',
          '+      "version": "5.4.1",',
          '+      "resolved": "https://registry.npmjs.org/ioredis/-/ioredis-5.4.1.tgz",',
          '+      "integrity": "sha512-AAAA"',
          '+    },',
          '+    "node_modules/rate-limiter-flexible": {',
          '+      "version": "5.0.3",',
          '+      "resolved": "https://registry.npmjs.org/rate-limiter-flexible/-/rate-limiter-flexible-5.0.3.tgz",',
          '+      "integrity": "sha512-BBBB"',
          '+    },',
        ].join('\n'),
      },
      {
        prId: pr!.id,
        path: 'src/db/migrations/0007_rate_limits.sql',
        additions: 18,
        deletions: 0,
        patch: [
          '@@ -0,0 +1,7 @@',
          '+CREATE TABLE "rate_limits" (',
          '+  "key" text PRIMARY KEY,',
          '+  "count" integer NOT NULL DEFAULT 0,',
          '+  "window_start" timestamp NOT NULL DEFAULT now()',
          '+);',
          '+CREATE INDEX "rate_limits_window_idx"',
          '+  ON "rate_limits" ("window_start");',
        ].join('\n'),
      },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- L02: Test Quality Reviewer + its reusable test-quality skill ----
  // The reviewer's capability lives in a SKILL (reusable across agents, toggled
  // per-agent), not in its prompt — so the skills control experiment is
  // observable: disable the skill on the Skills tab and the agent misses the
  // uncovered branch; enable it and the rubric flags it.
  let [skill] = await db
    .select()
    .from(t.skills)
    .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, 'test-quality-rubric')));
  if (!skill) {
    [skill] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        name: 'test-quality-rubric',
        description:
          'Flag weak tests: uncovered branches, missing corner cases, over-mocking, and flaky patterns.',
        type: 'rubric',
        source: 'manual',
        body: TEST_QUALITY_SKILL_BODY,
        enabled: true,
        version: 1,
      })
      .returning();
    await db
      .insert(t.skillVersions)
      .values({ skillId: skill!.id, version: 1, body: TEST_QUALITY_SKILL_BODY })
      .onConflictDoNothing();
  }

  let [tqAgent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Test Quality Reviewer')));
  if (!tqAgent) {
    [tqAgent] = await db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'Test Quality Reviewer',
        description:
          'Checks test quality — uncovered branches, missed corner cases, over-mocking, flaky tests (via the test-quality-rubric skill).',
        provider: DEFAULT_PROVIDER,
        model: DEFAULT_MODEL,
        systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
        enabled: true,
        version: 1,
        createdBy: userId,
      })
      .returning();
  }

  // Attach the skill (enabled) so a default run already flags weak tests.
  await db
    .insert(t.agentSkills)
    .values({ agentId: tqAgent!.id, skillId: skill!.id, order: 0, enabled: true })
    .onConflictDoNothing();

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
