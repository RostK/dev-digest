/**
 * Stderr-only logger for the MCP server process.
 *
 * IMPORTANT: stdout is reserved for JSON-RPC messages. All log output MUST go
 * to stderr. Never log secrets, API keys, or LLM tokens.
 */

export function logInfo(msg: string): void {
  process.stderr.write(`[devdigest-mcp] INFO  ${msg}\n`);
}

export function logError(msg: string, err?: unknown): void {
  const detail =
    err instanceof Error
      ? ` — ${err.message}`
      : err != null
        ? ` — ${String(err)}`
        : '';
  process.stderr.write(`[devdigest-mcp] ERROR ${msg}${detail}\n`);
}
