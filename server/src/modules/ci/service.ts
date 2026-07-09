import { unzipSync, strFromU8 } from 'fflate';
import type { Container } from '../../platform/container.js';
import type {
  CiExport,
  CiExportInput,
  CiFile,
  CiInstallation,
  CiRun,
  CiTarget,
} from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { CiRepository } from './repository.js';
import {
  mapArtifactToRun,
  parseRepo,
  readRunnerFiles,
  toCiInstallationDto,
  toCiRunDto,
} from './helpers.js';
import { buildManifest, manifestToYaml, skillFiles, type ManifestSkillInput } from './manifest.js';
import { buildWorkflowYaml } from './workflow.js';
import { slugify } from './slug.js';
import {
  CI_BRANCH,
  DEVDIGEST_DIR,
  RESULT_FILENAME,
  RUNNER_ARTIFACT_NAME,
  WORKFLOW_PATH,
} from './constants.js';

const WORKFLOW_FILENAME = WORKFLOW_PATH.split('/').pop()!;

/**
 * CI module service — Export-to-CI (SPEC-07 T3). Perf NFR: no `container.llm`
 * call anywhere in this file — export/sync are bounded GitHub REST sequences,
 * never an LLM call.
 */
export class CiService {
  private repo: CiRepository;

  constructor(private container: Container) {
    this.repo = new CiRepository(container.db);
  }

  /**
   * Preview the export bundle: manifest (editable:false) + one `.md` per
   * enabled skill + empty `memory.jsonl` + the pre-built runner files +
   * the generated workflow (editable:true) — AC-4. GitHub Actions only in v1
   * (AC-20): a non-`gha` target has no functional preview.
   */
  async preview(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiFile[]> {
    this.assertGhaTarget(input.target);
    const { agent, enabledSkills } = await this.resolveAgentAndSkills(workspaceId, agentId);
    return this.buildBundle(agent, enabledSkills, input);
  }

  /**
   * Install the export: `open_pr` atomically commits the bundle to
   * `devdigest/ci` (never `base`) then opens/reuses a PR and upserts the
   * installation (AC-13/AC-15). `files` returns the bundle only — no
   * commit/PR/installation row (AC-14). A non-`gha` target performs no
   * functional export at all (AC-20).
   */
  async install(
    workspaceId: string,
    agentId: string,
    input: CiExportInput,
  ): Promise<CiExport> {
    this.assertGhaTarget(input.target);
    const { agent, enabledSkills } = await this.resolveAgentAndSkills(workspaceId, agentId);
    const files = this.buildBundle(agent, enabledSkills, input);

    if (input.action === 'files') {
      return { installation: null, files, pr_url: null };
    }

    // action === 'open_pr' (AC-13).
    const gh = await this.container.github();
    const repo = parseRepo(input.repo);
    let pr: { url: string };
    try {
      await gh.commitFiles(repo, {
        branch: CI_BRANCH,
        base: input.base,
        message: 'chore(ci): update DevDigest CI configuration',
        files: files.map((f) => ({ path: f.path, contents: f.contents })),
      });
      const existingPr = await gh.findOpenPr(repo, CI_BRANCH);
      pr =
        existingPr ??
        (await gh.openPullRequest(repo, {
          title: 'Add DevDigest CI review',
          head: CI_BRANCH,
          base: input.base,
          body: 'Automated PR from DevDigest to install/update the CI review workflow. Review every file before merging — see `.github/workflows/devdigest-review.yml`.',
        }));
    } catch (err) {
      // Surface a token-permission failure as an actionable 422 rather than a
      // generic 500: "Open a PR" commits the bundle (create-tree/commit/ref),
      // which needs Contents:write — a read-only token 403s here.
      throw this.asGitHubWriteError(err, input.repo, input.base);
    }

    const installationRow = await this.repo.upsertInstallation(
      workspaceId,
      agentId,
      input.repo,
      input.target,
    );
    if (!installationRow) throw new NotFoundError('Agent not found');

    return {
      installation: toCiInstallationDto(installationRow),
      files,
      pr_url: pr.url,
    };
  }

  /**
   * Map a GitHub write failure from the `open_pr` path to an actionable error:
   * a read-only token 403s on create-tree/commit; a missing repo/base 404s.
   * Anything else is rethrown unchanged.
   */
  private asGitHubWriteError(err: unknown, repo: string, base: string): Error {
    const status = (err as { status?: number } | null)?.status;
    const message = err instanceof Error ? err.message : String(err);
    if (status === 403 || /not accessible by personal access token/i.test(message)) {
      return new ValidationError(
        `GitHub rejected the export to "${repo}". The export commits "${WORKFLOW_PATH}", so the GitHub token needs ` +
          `BOTH "Contents: Read and write" AND "Workflows: Read and write" on a fine-grained PAT ` +
          `(or the "repo" + "workflow" scopes on a classic token) for "${repo}". Grant the missing permission and retry — ` +
          `or use "Copy files as a zip", which needs no token.`,
      );
    }
    if (status === 404) {
      return new ValidationError(
        `GitHub could not find "${repo}" or its base branch "${base}". Check the owner/name and that the token can access the repository.`,
      );
    }
    return err instanceof Error ? err : new Error(message);
  }

  /**
   * Sync (PULL): list the installation repo's `devdigest-review.yml` runs,
   * download each run's result artifact, `safeParse` it against
   * `CiResultArtifact` (untrusted — server/INSIGHTS.md:63), and upsert a
   * `ci_runs` row for every run that parses. A malformed/missing artifact is
   * skipped with NO row written; other runs still get ingested (AC-17).
   * Returns only the runs actually ingested this call.
   */
  async sync(workspaceId: string, installationId: string): Promise<CiRun[]> {
    const installation = await this.repo.getInstallation(workspaceId, installationId);
    if (!installation) throw new NotFoundError('CI installation not found');

    const gh = await this.container.github();
    const repo = parseRepo(installation.repo);
    const runs = await gh.listWorkflowRuns(repo, WORKFLOW_FILENAME);

    const ingested: CiRun[] = [];
    for (const run of runs) {
      const bytes = await gh.downloadRunArtifact(repo, run.id, RUNNER_ARTIFACT_NAME);
      if (!bytes) continue; // no artifact yet (still running / expired) — skip, no row

      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(bytes);
      } catch {
        continue; // corrupt zip — skip
      }

      const resultBytes = entries[RESULT_FILENAME];
      if (!resultBytes) continue; // artifact has no result file — skip

      let json: unknown;
      try {
        json = JSON.parse(strFromU8(resultBytes));
      } catch {
        continue; // not valid JSON — skip
      }

      const parsed = CiResultArtifact.safeParse(json); // AC-17: safeParse, never `as`
      if (!parsed.success) continue; // malformed — skip, NO row (AC-17)

      const row = await this.repo.upsertRun(mapArtifactToRun(installation.id, run, parsed.data));
      ingested.push(
        toCiRunDto({
          ...row,
          repo: installation.repo,
          targetType: installation.targetType as CiTarget,
          agentName: null,
        }),
      );
    }
    return ingested;
  }

  /** Enriched CI Runs, workspace-scoped (AC-18). */
  async listRuns(workspaceId: string): Promise<CiRun[]> {
    const rows = await this.repo.listRuns(workspaceId);
    return rows.map(toCiRunDto);
  }

  /** Installations for one agent (CI tab). Throws 404 when the agent isn't in this workspace. */
  async listInstallationsForAgent(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    await this.assertAgentInWorkspace(workspaceId, agentId);
    const rows = await this.repo.listInstallationsForAgent(workspaceId, agentId);
    return rows.map(toCiInstallationDto);
  }

  /** Run history for one agent (CI tab). Throws 404 when the agent isn't in this workspace. */
  async listRunsForAgent(workspaceId: string, agentId: string): Promise<CiRun[]> {
    await this.assertAgentInWorkspace(workspaceId, agentId);
    const rows = await this.repo.listRunsForAgent(workspaceId, agentId);
    return rows.map(toCiRunDto);
  }

  // ---- internal ------------------------------------------------------------

  private assertGhaTarget(target: CiTarget): void {
    if (target !== 'gha') {
      throw new ValidationError(
        `CI export target "${target}" has no functional export in v1 (GitHub Actions only)`,
      );
    }
  }

  private async assertAgentInWorkspace(workspaceId: string, agentId: string): Promise<void> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
  }

  /**
   * Resolve the agent + its ENABLED skills (binding enabled AND skill enabled
   * — same filter as the review executor) via `container.agentsRepo`, never a
   * sibling-module import (server/INSIGHTS.md:47).
   */
  private async resolveAgentAndSkills(workspaceId: string, agentId: string) {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const links = await this.container.agentsRepo.linkedSkills(agentId);
    const enabledSkills = links
      .filter((l) => l.enabled && l.skill.enabled)
      .map((l) => ({ name: l.skill.name, body: l.skill.body }) satisfies ManifestSkillInput);
    return { agent, enabledSkills };
  }

  /** Assemble the bundle: manifest + skill files + empty memory + runner + workflow (AC-4). */
  private buildBundle(
    agent: { name: string; systemPrompt: string; model: string; strategy: 'auto' | 'single-pass' | 'map-reduce'; ciFailOn: 'never' | 'critical' | 'warning' | 'any' },
    enabledSkills: ManifestSkillInput[],
    input: CiExportInput,
  ): CiFile[] {
    const manifest = buildManifest(
      {
        name: agent.name,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        strategy: agent.strategy,
        ciFailOn: agent.ciFailOn,
      },
      enabledSkills,
    );
    const slug = slugify(agent.name);

    const manifestFile: CiFile = {
      path: `${DEVDIGEST_DIR}/agents/${slug}.yaml`,
      contents: manifestToYaml(manifest),
      editable: false,
    };
    const skillCiFiles: CiFile[] = skillFiles(enabledSkills).map((f) => ({
      path: f.path,
      contents: f.body,
      editable: false,
    }));
    const memoryFile: CiFile = {
      path: `${DEVDIGEST_DIR}/memory.jsonl`,
      contents: '',
      editable: false,
    };
    const runnerFiles = readRunnerFiles();
    const workflowFile: CiFile = {
      path: WORKFLOW_PATH,
      // Honor a user's hand-edited workflow from Preview (AC-4); otherwise
      // generate deterministically from the Configure choices.
      contents:
        input.workflow_override ??
        buildWorkflowYaml({ triggers: input.triggers, post_as: input.post_as }),
      editable: true,
    };

    return [manifestFile, ...skillCiFiles, memoryFile, ...runnerFiles, workflowFile];
  }
}
