/**
 * get_blast_radius tool — report a pull request's blast radius.
 *
 * Reads the DevDigest repo-intel index (no parsing at call time): the PR's
 * changed symbols → their callers → impacted endpoints/crons, plus an honest
 * degraded flag when the index is incomplete. Mirrors get_findings' inputs
 * (repo "owner/name" + PR number).
 *
 * Architecture (onion):
 *   handler depends on the ApiClient port + resolveRepo/resolvePr helpers.
 *   `registerGetBlastRadius` is the thin wiring; tests call `getBlastRadiusHandler` directly.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool } from '../register.js';
import type { ApiClient } from '../api-client.js';
import { ApiError, NetworkError } from '../api-client.js';
import { ForwardError } from '../errors.js';
import { resolveRepo, resolvePr } from '../resolve.js';
import { toBlastOutput } from '../format.js';

// ---------------------------------------------------------------------------
// Deps type
// ---------------------------------------------------------------------------

export interface HandlerDeps {
  client: ApiClient;
  config: { apiUrl: string };
}

// ---------------------------------------------------------------------------
// Input type (mirrors the inputSchema raw shape)
// ---------------------------------------------------------------------------

export interface GetBlastRadiusInput {
  repo: string;
  pr: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function errResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

function ok(text: string, structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent };
}

function catchToResult(err: unknown, apiUrl: string): CallToolResult {
  if (err instanceof ForwardError) return errResult(err.message);
  if (err instanceof NetworkError) {
    return errResult(
      `cannot reach the DevDigest API at ${apiUrl} — is the server running (cd server && pnpm dev)?`,
    );
  }
  if (err instanceof ApiError) return errResult(`API error: ${err.message}`);
  return errResult(`unexpected error: ${err instanceof Error ? err.message : String(err)}`);
}

// ---------------------------------------------------------------------------
// Pure handler — call directly in tests with a fake ApiClient
// ---------------------------------------------------------------------------

export async function getBlastRadiusHandler(
  deps: HandlerDeps,
  input: GetBlastRadiusInput,
): Promise<CallToolResult> {
  try {
    const { repo, pr } = input;
    const repoRecord = await resolveRepo(deps.client, repo);
    const prId = await resolvePr(deps.client, repoRecord.id, pr);
    const res = await deps.client.blastForPr(prId);
    const out = toBlastOutput(res);

    if (out.changed_symbols.length === 0 && out.downstream.length === 0) {
      const hint = out.degraded
        ? ' (the repo-intel index is degraded — re-index the repo for full results)'
        : '';
      return ok(
        `no blast radius for "${repo}" #${pr} — no indexed symbols in the changed files${hint}.`,
        out as unknown as Record<string, unknown>,
      );
    }

    return ok(JSON.stringify(out, null, 2), out as unknown as Record<string, unknown>);
  } catch (err) {
    return catchToResult(err, deps.config.apiUrl);
  }
}

// ---------------------------------------------------------------------------
// Register wrapper — called by server.ts at startup
// ---------------------------------------------------------------------------

export function registerGetBlastRadius(server: McpServer, deps: HandlerDeps): void {
  registerTool(
    server,
    'get_blast_radius',
    {
      title: 'Get pull request blast radius',
      description:
        "Report a pull request's blast radius — the changed symbols, who calls them, and the impacted HTTP endpoints/crons. Read straight from the repo-intel index; flags a degraded/partial index instead of failing.",
      inputSchema: {
        repo: z
          .string()
          .describe('Repository as "owner/name", e.g. acme/payments-api.'),
        pr: z.number().int().describe('Pull request number, e.g. 482.'),
      },
      outputSchema: {
        summary: z.string(),
        changed_symbols: z.array(
          z.object({ name: z.string(), file: z.string(), kind: z.string() }),
        ),
        downstream: z.array(
          z.object({
            symbol: z.string(),
            callers: z.array(
              z.object({ name: z.string(), file: z.string(), line: z.number() }),
            ),
            endpoints_affected: z.array(z.string()),
            crons_affected: z.array(z.string()),
          }),
        ),
        degraded: z.boolean(),
        index_status: z.string().nullable(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => getBlastRadiusHandler(deps, args),
  );
}
