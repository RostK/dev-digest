/**
 * get_blast_radius tool — STUB.
 *
 * The repo-intel blast HTTP route ships in a later lesson. Until then, this tool
 * ALWAYS returns isError:true and NEVER calls the API. The output schema is declared
 * to match the future BlastResult shape so Layer 4 can wire it up without changes.
 *
 * Architecture (onion):
 *   handler is a pure no-op that never touches deps.client.
 *   `registerGetBlastRadius` is the thin wiring; tests call `getBlastRadiusHandler` directly.
 */

import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';

// ---------------------------------------------------------------------------
// Deps type (client is accepted but never called — future use)
// ---------------------------------------------------------------------------

export interface HandlerDeps {
  client: ApiClient;
  config: { apiUrl: string };
}

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface GetBlastRadiusInput {
  repo: string;
  files: string[];
}

// ---------------------------------------------------------------------------
// Pure handler — always isError:true, never throws, never calls the API
// ---------------------------------------------------------------------------

export async function getBlastRadiusHandler(
  _deps: HandlerDeps,
  _input: GetBlastRadiusInput,
): Promise<CallToolResult> {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: 'get_blast_radius is not implemented yet — the repo-intel blast HTTP route ships in a later lesson.',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Register wrapper — called by server.ts at startup
// ---------------------------------------------------------------------------

export function registerGetBlastRadius(server: McpServer, deps: HandlerDeps): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get pull request blast radius',
      description:
        'Report the blast radius of a PR\'s changed files — impacted symbols, their callers, and affected endpoints. Not implemented yet; returns a not-implemented notice.',
      inputSchema: {
        repo: z
          .string()
          .describe('Repository as "owner/name", e.g. acme/payments-api.'),
        files: z.array(z.string()),
      },
      outputSchema: {
        changed_symbols: z.array(z.unknown()),
        callers: z.array(z.unknown()),
        impacted_endpoints: z.array(z.unknown()),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => getBlastRadiusHandler(deps, args),
  );
}
