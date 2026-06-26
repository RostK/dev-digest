/**
 * Runtime configuration from environment variables. No secrets.
 *
 * DEVDIGEST_API_URL   — base URL of the local DevDigest API (default http://localhost:3001)
 * MCP_REVIEW_TIMEOUT_MS — how long to wait for a review run before giving up (default 180 000 ms)
 * MCP_POLL_INTERVAL_MS  — how often to poll run status (default 2 000 ms)
 */
export const config = {
  /** Base URL of the local DevDigest API. */
  apiUrl: process.env['DEVDIGEST_API_URL'] ?? 'http://localhost:3001',
  /** Maximum milliseconds to wait for a review run to complete. */
  reviewTimeoutMs: Number(process.env['MCP_REVIEW_TIMEOUT_MS'] ?? 180_000),
  /** Polling interval in milliseconds for run status checks. */
  pollIntervalMs: Number(process.env['MCP_POLL_INTERVAL_MS'] ?? 2_000),
} as const;
