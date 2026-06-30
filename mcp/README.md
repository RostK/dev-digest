# @devdigest/mcp

Local stdio MCP server for the DevDigest PR reviewer. Acts as an HTTP client of
the DevDigest API (`http://localhost:3001`) and exposes the review workflow to any
MCP host (Claude Code, Claude Desktop, etc.) over stdin/stdout.

## Tools

| Tool | What it does |
|---|---|
| `list_agents` | List the configured reviewer agents with their id, name, model, description, and enabled state. Call this first to get a valid agent id for `run_agent_on_pull_request`. |
| `run_agent_on_pull_request` | Review a pull request and return its findings. Creates the run, waits for it to finish, and returns the verdict plus findings in one call. |
| `get_findings` | Return the verdict and findings of a pull request's most recent completed review, without starting a new one. Use after `run_agent_on_pull_request` or to re-read an earlier result. |
| `get_conventions` | List a repository's stored coding conventions (category, rule, and where each is evidenced in the code). |
| `get_blast_radius` | **Stub** — not implemented yet. The repo-intel blast HTTP route ships in a later lesson. Always returns a not-implemented notice. |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the local DevDigest API. |
| `MCP_REVIEW_TIMEOUT_MS` | `180000` | How long (ms) to wait for a review run before timing out. |
| `MCP_POLL_INTERVAL_MS` | `2000` | Polling interval (ms) for checking run status. |

Values are validated on startup (Zod): the two `*_MS` vars must be positive
integers and `DEVDIGEST_API_URL` a valid URL. A bad value fails fast with a
message naming the offending var — the server never starts with a `NaN` timeout.

## Installation

```bash
cd mcp && pnpm install
```

## Development

The package is managed with **pnpm** (pinned via `packageManager` in `package.json`).

| Script | What it does |
|---|---|
| `pnpm start` | Run the stdio server directly (`tsx src/index.ts`). |
| `pnpm inspect` | Launch the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) against the server — a browser UI to call tools and watch JSON-RPC traffic. |
| `pnpm typecheck` | Type-check with `tsc --noEmit`. |
| `pnpm test` | Run the Vitest suite. |

### Inspecting the server

```bash
cd mcp && pnpm inspect
```

This boots the server over stdio (`npx @modelcontextprotocol/inspector tsx src/index.ts`)
and opens the Inspector web UI, where you can list and call each tool. The server starts
regardless, but for the tools to return real data the DevDigest API must be running on
`http://localhost:3001` (start it via `./scripts/dev.sh`). All diagnostics go to stderr,
so the only stdout traffic the Inspector shows is JSON-RPC messages.

## Registration

Add the following block to your `.mcp.json` (already present at the repo root):

```json
{ "mcpServers": { "devdigest": {
  "command": "npx", "args": ["-y", "tsx", "mcp/src/index.ts"],
  "env": { "DEVDIGEST_API_URL": "http://localhost:3001" }
} } }
```

After installing, restart the MCP host so it spawns the stdio server. Approving a
new MCP server is a manual step in the host's settings UI.

## Logging

All log output goes to **stderr only**. Stdout is reserved for JSON-RPC messages.
Secrets are never logged.

## Notes

- The server talks to the DevDigest API without auth headers (local `LocalNoAuth` workspace).
- `get_blast_radius` is a forward-compatible stub: its output schema mirrors the
  future `BlastResult` shape so the tool can be wired up without changes later.
- Shared contracts from `@devdigest/shared` are imported **type-only** — the package
  has zero runtime dependency on the tsconfig path alias.
