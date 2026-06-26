/**
 * Resolve human-friendly identifiers (repo "owner/name", PR number, agent id)
 * to the UUIDs the API expects.
 *
 * Each function throws a ForwardError — never a generic Error — so that tool
 * handlers can catch it and turn it into an { isError: true } MCP response
 * with a message that names the next step or enumerates the valid options.
 *
 * All @devdigest/shared imports are type-only: they are erased at runtime,
 * so this module has zero runtime dependency on the tsconfig path alias.
 */

import type { Agent, Repo } from '@devdigest/shared';
import type { ApiClient } from './api-client.js';
import { ForwardError } from './errors.js';

/**
 * Resolve a "owner/name" repository slug to the full Repo record.
 *
 * @throws {ForwardError} when no repo matches, with a list of available names
 *                        (or a suggestion to add a repo when the list is empty).
 */
export async function resolveRepo(
  client: ApiClient,
  repo: string,
): Promise<Repo> {
  const repos = await client.listRepos();

  const found = repos.find(r => r.full_name === repo);
  if (found) return found;

  if (repos.length === 0) {
    throw new ForwardError(
      `repository "${repo}" not found — no repositories have been added yet; ` +
        `add one in DevDigest first.`,
    );
  }

  const list = repos.map(r => r.full_name).join(', ');
  throw new ForwardError(
    `repository "${repo}" not found — available repositories: ${list}`,
  );
}

/**
 * Resolve a PR number within a repo to its UUID.
 *
 * Guards against `PrMeta.id` being nullish (a PR imported from GitHub but not
 * yet tracked in DevDigest): those rows are skipped and never returned.
 *
 * @throws {ForwardError} when no matching, uuid-having PR is found, with a
 *                        list of known PR numbers.
 */
export async function resolvePr(
  client: ApiClient,
  repoId: string,
  prNumber: number,
): Promise<string> {
  const pulls = await client.listPulls(repoId);

  // Only return a PR whose id is non-nullish (i.e., fully imported/tracked).
  const pr = pulls.find(p => p.number === prNumber && p.id != null);
  if (pr?.id) return pr.id;

  const knownNumbers = pulls.map(p => p.number).join(', ');
  throw new ForwardError(
    `PR #${prNumber} not found in this repository` +
      (knownNumbers.length > 0
        ? ` — known PR numbers: ${knownNumbers}`
        : ` — no pull requests have been imported yet`),
  );
}

/**
 * Resolve an agent id to its full Agent record.
 *
 * @throws {ForwardError} when no agent matches, directing the model to call
 *                        list_agents to discover valid ids.
 */
export async function resolveAgent(
  client: ApiClient,
  agentId: string,
): Promise<Agent> {
  const agents = await client.listAgents();

  const found = agents.find(a => a.id === agentId);
  if (found) return found;

  throw new ForwardError(
    `agent '${agentId}' not found — call list_agents to see available agent ids`,
  );
}
