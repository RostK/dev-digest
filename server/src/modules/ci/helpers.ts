// Pure(ish) helpers for the ci module: reading the pre-built agent-runner
// bundle off disk, parsing an "owner/name" repo string, and mapping a synced
// GitHub Actions result artifact + row -> DTO. The ONLY I/O here is the
// runner-file read (readRunnerFiles) — no DB, no network, no container.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CiFile,
  CiInstallation,
  CiResultArtifact,
  CiRun,
  CiTarget,
  RepoRef,
  WorkflowRunMeta,
} from '@devdigest/shared';
import { ConfigError, ValidationError } from '../../platform/errors.js';
import { RUNNER_DIR } from './constants.js';
import type { CiInstallationRow, EnrichedCiRunRow, NewCiRun } from './repository.js';

/**
 * Resolve the `agent-runner/dist` directory to embed as `.devdigest/runner/*`.
 * Windows-safe: derives the path from `import.meta.url` via `node:url` +
 * `node:path` only — never a hand-concatenated `/` or `file://` string
 * (server/INSIGHTS.md:26). `DEVDIGEST_RUNNER_DIR` is an optional override for
 * local/dev testing (not a secret — a filesystem path).
 */
function resolveRunnerDistDir(): string {
  const override = process.env.DEVDIGEST_RUNNER_DIR;
  if (override) return override;
  // This file lives at <repoRoot>/server/src/modules/ci/helpers.ts — four
  // levels up (ci -> modules -> src -> server) reaches <repoRoot>.
  const here = fileURLToPath(import.meta.url);
  const repoRoot = join(dirname(here), '..', '..', '..', '..');
  return join(repoRoot, 'agent-runner', 'dist');
}

/** All file paths under `dir`, recursively, relative to `dir` (platform separators). */
function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { recursive: true }) as string[];
  return entries.filter((rel) => statSync(join(dir, rel)).isFile());
}

/**
 * Read the pre-built, self-contained CI runner (`agent-runner/dist/*`) and map
 * each file to `.devdigest/runner/<rel>` in the export bundle, POSIX-normalized
 * regardless of host OS (server/INSIGHTS.md:26). MUST ship every file in
 * `dist/` (`index.js` + `300.index.js` + `package.json`) — shipping only
 * `index.js` silently breaks the lazy chunk loader. All runner files are
 * pre-built assets, never editable in the Preview step (AC-4).
 */
export function readRunnerFiles(): CiFile[] {
  const distDir = resolveRunnerDistDir();
  let relPaths: string[];
  try {
    relPaths = listFilesRecursive(distDir);
  } catch {
    throw new ConfigError(
      `agent-runner build output not found at ${distDir} — run "pnpm build" in agent-runner/ first.`,
    );
  }
  return relPaths.map((rel) => {
    const posixRel = rel.split(sep).join('/');
    return {
      path: `${RUNNER_DIR}/${posixRel}`,
      contents: readFileSync(join(distDir, rel), 'utf-8'),
      editable: false,
    };
  });
}

/** Parse an "owner/name" repo string into a `RepoRef`. */
export function parseRepo(repo: string): RepoRef {
  const [owner, name, ...rest] = repo.split('/');
  if (!owner || !name || rest.length > 0) {
    throw new ValidationError('repo must be in "owner/name" form');
  }
  return { owner, name };
}

/**
 * Map a Sync-downloaded, ALREADY-VALIDATED `CiResultArtifact` (safeParse'd by
 * the caller — server/INSIGHTS.md:63) + its GitHub Actions run metadata to a
 * `ci_runs` insert. `status` is derived from the artifact + run conclusion:
 * zero findings -> 'no_findings'; the workflow's deterministic gate exits
 * non-zero on a block -> conclusion 'failure' maps to 'failed'; otherwise
 * 'succeeded'. `source` is always 'ci' (AC-16).
 */
export function mapArtifactToRun(
  ciInstallationId: string,
  run: WorkflowRunMeta,
  artifact: CiResultArtifact,
): NewCiRun {
  const status =
    artifact.findings_count === 0
      ? 'no_findings'
      : run.conclusion === 'success'
        ? 'succeeded'
        : 'failed';
  return {
    ciInstallationId,
    prNumber: artifact.pr_number ?? run.pr_number ?? null,
    ranAt: run.created_at ? new Date(run.created_at) : null,
    status,
    findingsCount: artifact.findings_count,
    costUsd: artifact.cost_usd,
    githubUrl: run.html_url,
    source: 'ci',
  };
}

/** Map a persisted `ci_installations` row to the public `CiInstallation` DTO. */
export function toCiInstallationDto(row: CiInstallationRow): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType as CiTarget,
    installed_at: row.installedAt.toISOString(),
  };
}

/** Map an enriched `ci_runs` row (⋈ ci_installations ⋈ agents) to the `CiRun` DTO (AC-18). */
export function toCiRunDto(row: EnrichedCiRunRow): CiRun {
  return {
    id: row.id,
    ci_installation_id: row.ciInstallationId,
    pr_number: row.prNumber,
    ran_at: row.ranAt ? row.ranAt.toISOString() : null,
    status: row.status,
    findings_count: row.findingsCount,
    cost_usd: row.costUsd,
    github_url: row.githubUrl,
    source: row.source,
    agent: row.agentName ?? null,
    // Not persisted (ci_runs has no duration column — no migration, per plan).
    duration_s: null,
    repo: row.repo ?? null,
    target_type: (row.targetType as CiTarget | null) ?? null,
  };
}
