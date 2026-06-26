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
        filesCount: 10,
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
          '+',
          '@@ -55,0 +67,12 @@ function limitFor(req: Req): number {',
          '+function bucketKey(req: Req): string {',
          '+  // Uses X-Forwarded-For header directly — not validated, can be spoofed',
          '+  const ip = req.headers["x-forwarded-for"] ?? req.socket.remoteAddress;',
          '+  return `rl:${req.path}:${ip}`;',
          '+}',
          '+',
          '+export function resetLimit(req: Req): Promise<void> {',
          '+  // No auth check — any caller can reset any bucket',
          '+  const key = bucketKey(req);',
          '+  return redis.del(key).then(() => undefined);',
          '+}',
          '+',
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
          '@@ -80,0 +82,14 @@ export async function retryWebhook(id: string) {',
          '+  const event = await db.events.find(id);',
          '+  // callback_url not re-validated — SSRF on retry path',
          '+  const target = event.callbackUrl;',
          '+  const account = await db.accounts.find(event.accountId);',
          '+  const token = account.apiToken;',
          '+  // token forwarded to external host without scheme validation',
          '+  await fetch(target, {',
          '+    method: "POST",',
          '+    headers: { Authorization: token, "Content-Type": "application/json" },',
          '+    body: JSON.stringify(event.payload),',
          '+  });',
          '+}',
          '+',
          '+export const webhookSecret = process.env.WEBHOOK_SECRET ?? "hardcoded-fallback-secret";',
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
      // ---- boilerplate (test file) ----
      {
        prId: pr!.id,
        path: 'test/ratelimit.test.ts',
        additions: 6,
        deletions: 0,
        patch: [
          '@@ -0,0 +1,6 @@',
          '+import { describe, it, expect } from "vitest";',
          '+import { rateLimit } from "../src/middleware/ratelimit";',
          '+describe("rateLimit middleware", () => {',
          '+  it("returns 429 when limit exceeded", async () => {',
          '+    expect(true).toBe(true); // placeholder',
          '+  });',
          '+});',
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
      // ---- src/config.ts (wiring) ----
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale:
          'Line 12 contains a literal `sk_live_` Stripe secret key committed to source control. ' +
          'Anyone with repo access can extract it.',
        suggestion: 'Remove the key from code, store it in an env var, and rotate the key immediately.',
        confidence: 0.98,
      },
      // ---- src/api/users.ts (core) ----
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 49,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale:
          'The loop on line 45 calls `db.orders.findByUser(u.id)` once per user, ' +
          'producing N+1 database round-trips as the user count grows.',
        suggestion: 'Fetch all orders in one `IN` query keyed on user IDs, then group in memory.',
        confidence: 0.86,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 47,
        endLine: 47,
        severity: 'WARNING',
        category: 'perf',
        title: 'Per-user order query missing index on user_id',
        rationale:
          '`db.orders.findByUser(u.id)` scans orders without a confirmed index on `user_id`, ' +
          'causing a full table scan on every iteration.',
        suggestion: 'Add `CREATE INDEX orders_user_id_idx ON orders (user_id)` and batch the lookup.',
        confidence: 0.79,
      },
      // ---- src/middleware/ratelimit.ts (core) ----
      {
        reviewId: review!.id,
        file: 'src/middleware/ratelimit.ts',
        startLine: 27,
        endLine: 27,
        severity: 'SUGGESTION',
        category: 'correctness',
        title: 'Race condition in counter expiry (TOCTOU)',
        rationale:
          'Lines 26-27 increment the key then conditionally set expiry only when count === 1. ' +
          'Under concurrent requests the count may never equal 1 and the key never expires, ' +
          'leaving the bucket permanently blocked.',
        suggestion:
          'Use `INCR` + `EXPIRE` in a single Redis pipeline or Lua script to make the operation atomic.',
        confidence: 0.82,
      },
      {
        reviewId: review!.id,
        file: 'src/middleware/ratelimit.ts',
        startLine: 69,
        endLine: 69,
        severity: 'WARNING',
        category: 'security',
        title: 'X-Forwarded-For header used without validation (IP spoofing)',
        rationale:
          'Line 69 reads `x-forwarded-for` directly from the request headers to build the rate-limit ' +
          'bucket key. An attacker can set this header to any value, trivially bypassing per-IP limits.',
        suggestion:
          'Only trust `x-forwarded-for` when the upstream proxy is trusted. ' +
          'Configure a trusted-proxy list (e.g. fastify `trustProxy`) and use the parsed `req.ip`.',
        confidence: 0.91,
      },
      // ---- src/api/public/webhooks.ts (core) ----
      {
        reviewId: review!.id,
        file: 'src/api/public/webhooks.ts',
        startLine: 60,
        endLine: 61,
        severity: 'CRITICAL',
        category: 'security',
        title: 'SSRF + secret token forwarded to attacker-controlled URL',
        rationale:
          'Lines 60-61 read `callback_url` from the request body without validation and use it as the ' +
          'fetch target, while also forwarding the account\'s `apiToken` in the Authorization header. ' +
          'An attacker can supply an internal URL (e.g. `http://169.254.169.254/`) to perform SSRF ' +
          'and simultaneously exfiltrate the token to an external host.',
        suggestion:
          'Validate `callback_url` against an allowlist of schemes (https only) and trusted domains. ' +
          'Never forward internal auth tokens to external endpoints.',
        confidence: 0.97,
      },
      {
        reviewId: review!.id,
        file: 'src/api/public/webhooks.ts',
        startLine: 84,
        endLine: 88,
        severity: 'CRITICAL',
        category: 'security',
        title: 'SSRF on webhook retry path — callback URL not re-validated',
        rationale:
          'The retry handler at line 84 reloads `callbackUrl` from the DB and immediately fetches it, ' +
          'with no URL validation. If a stored URL was tampered with (or stored before validation existed), ' +
          'the retry path bypasses all controls.',
        suggestion:
          'Re-validate the stored URL against the same allowlist on every use, not just on creation.',
        confidence: 0.94,
      },
      {
        reviewId: review!.id,
        file: 'src/api/public/webhooks.ts',
        startLine: 94,
        endLine: 94,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded fallback webhook secret',
        rationale:
          'Line 94 falls back to the literal string `"hardcoded-fallback-secret"` when ' +
          '`WEBHOOK_SECRET` is unset. Any environment without this env var silently uses a known key.',
        suggestion:
          'Require `WEBHOOK_SECRET` at startup and throw `ConfigError` when it is absent — ' +
          'never fall back to a hardcoded value.',
        confidence: 0.99,
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
