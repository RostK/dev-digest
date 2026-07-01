/**
 * Runtime configuration from environment variables. No secrets.
 *
 * DEVDIGEST_API_URL     — base URL of the local DevDigest API (default http://localhost:3001)
 * MCP_REVIEW_TIMEOUT_MS — how long to wait for a review run before giving up (default 180 000 ms)
 * MCP_POLL_INTERVAL_MS  — how often to poll run status (default 2 000 ms)
 *
 * Values are validated with Zod and the server FAILS FAST on bad input. A raw
 * `Number(process.env.X)` would coerce `"abc"` to NaN and start silently — the
 * polling loop then derives `maxAttempts = ceil(NaN / interval) = NaN`, never
 * polls, and immediately reports a bogus timeout. Validating here turns that
 * silent misconfiguration into a clear startup error instead.
 */

import { z } from 'zod';

/** Maps each config field back to the env var it is read from (for errors). */
const ENV_KEYS = {
  apiUrl: 'DEVDIGEST_API_URL',
  reviewTimeoutMs: 'MCP_REVIEW_TIMEOUT_MS',
  pollIntervalMs: 'MCP_POLL_INTERVAL_MS',
} as const;

const ConfigSchema = z.object({
  /** Base URL of the local DevDigest API. */
  apiUrl: z.string().url().default('http://localhost:3001'),
  /** Maximum milliseconds to wait for a review run to complete. */
  reviewTimeoutMs: z.coerce.number().int().positive().default(180_000),
  /** Polling interval in milliseconds for run status checks. */
  pollIntervalMs: z.coerce.number().int().positive().default(2_000),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Parse + validate config from an env bag (defaults to `process.env`).
 * Throws a single, actionable Error listing every offending env var.
 * Exported so tests can exercise validation without mutating `process.env`.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse({
    apiUrl: env[ENV_KEYS.apiUrl],
    reviewTimeoutMs: env[ENV_KEYS.reviewTimeoutMs],
    pollIntervalMs: env[ENV_KEYS.pollIntervalMs],
  });

  if (!parsed.success) {
    const details = parsed.error.issues
      .map(issue => {
        const field = issue.path[0] as keyof typeof ENV_KEYS;
        const envKey = ENV_KEYS[field] ?? String(issue.path[0]);
        return `  - ${envKey}=${JSON.stringify(env[envKey])}: ${issue.message}`;
      })
      .join('\n');
    throw new Error(
      `invalid DevDigest MCP configuration:\n${details}\n` +
        `Fix the env value(s) above, or unset them to use defaults.`,
    );
  }

  return parsed.data;
}

export const config: Config = loadConfig();
