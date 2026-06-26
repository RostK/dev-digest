/**
 * index.ts — composition root + stdio transport.
 *
 * The ONLY place in this package that:
 *  - constructs HttpApiClient (the concrete adapter)
 *  - reads config and builds deps
 *  - connects the McpServer to a StdioServerTransport
 *
 * IMPORTANT: stdout is reserved for JSON-RPC messages. Never write to stdout
 * here. All diagnostic output must go to stderr via log.ts.
 *
 * Architecture (onion): this is the outermost ring — the composition root.
 *   It injects the concrete HttpApiClient adapter; tools and server.ts depend
 *   only on the ApiClient port and never see HttpApiClient.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config.js';
import { HttpApiClient } from './api-client.js';
import { createServer } from './server.js';
import { logError, logInfo } from './log.js';

async function main(): Promise<void> {
  const client = new HttpApiClient({ baseUrl: config.apiUrl });

  const deps = { client, config };
  const server = createServer(deps);

  const transport = new StdioServerTransport();

  logInfo(`starting devdigest MCP server (API: ${config.apiUrl})`);

  await server.connect(transport);
}

main().catch((err: unknown) => {
  logError('fatal startup error', err);
  process.exit(1);
});
