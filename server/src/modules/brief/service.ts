import type { Brief } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { loadLinkedIssue, loadSpecDocs } from '../_shared/pr-body-refs.js';
import { BriefRepository } from './repository.js';
import {
  BriefProposal,
  buildBriefMessages,
  deterministicBrief,
  deterministicRiskLevel,
  groundBrief,
  shouldPersistBrief,
  smartDiffCounts,
  type FindingInput,
} from './helpers.js';

/**
 * PR Why+Risk Brief. Orchestrates:
 *   assemble inputs (intent, blast map, smart-diff COUNTS, linked issue + specs,
 *     existing findings — no diff bodies, ZERO extra model calls for the map)
 *     → ONE cheap LLM call (`risk_brief` feature model)
 *     → GROUND risks[].file_refs + review_focus[] against the real file/endpoint set
 *     → persist, falling back to a deterministic brief on any failure and NEVER
 *       clobbering an existing good brief with a degraded one.
 */
export class BriefService {
  private repo: BriefRepository;

  constructor(private container: Container) {
    this.repo = new BriefRepository(container.db);
  }

  /** Cached brief for a PR — resolves the PR in-workspace first (tenancy), then
   *  a pure `pr_brief` read. ZERO LLM calls. */
  async getCachedBrief(workspaceId: string, prId: string): Promise<Brief | null> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return this.repo.getBrief(prId);
  }

  /** Generate (or regenerate) the brief for a PR. Exactly ONE `container.llm`
   *  call on the happy path; falls back to a deterministic brief on any
   *  failure (AC-8), persisting the fallback only when no brief exists yet. */
  async generateBrief(workspaceId: string, prId: string): Promise<Brief> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const repoRow = await this.container.reviewRepo.getRepo(pull.repoId);
    const repoRef = repoRow ? { owner: repoRow.owner, name: repoRow.name } : undefined;

    const [intent, blast, files, reviews] = await Promise.all([
      this.container.reviewRepo.getIntent(prId),
      this.container.blast.blastMapForPr(workspaceId, prId),
      this.container.reviewRepo.getPrFiles(prId),
      this.container.reviewRepo.reviewsForPull(prId),
    ]);

    const linkedIssue = repoRef ? await loadLinkedIssue(this.container, repoRef, pull.body) : undefined;
    const specDocs = repoRef ? await loadSpecDocs(this.container, repoRef, pull.body) : [];

    const findings: FindingInput[] = reviews
      .flatMap((r) => r.findings)
      .filter((f) => !f.dismissedAt)
      .map((f) => ({ file: f.file, start_line: f.startLine, severity: f.severity, title: f.title }));

    const counts = smartDiffCounts(files);

    const changedFiles = new Set(files.map((f) => f.path));
    const blastFiles = new Set(blast.downstream.flatMap((d) => d.callers.map((c) => c.file)));
    for (const s of blast.changed_symbols) blastFiles.add(s.file);
    const findingFiles = new Set(findings.map((f) => f.file));
    const realFiles = new Set<string>([...changedFiles, ...blastFiles, ...findingFiles]);

    const brief = await this.tryGenerate({
      workspaceId,
      intent,
      blast,
      counts,
      realFiles,
      linkedIssue,
      specDocs,
      findings,
    });

    const existing = await this.repo.getBrief(prId);
    // Fallback persistence (AC-8): a degraded brief is stored ONLY when there
    // isn't already a good one — never clobber a prior good generation.
    if (!shouldPersistBrief(brief.degraded, existing !== null)) return existing!;

    const persisted: Brief = { ...brief.value, generated_at: new Date().toISOString() };
    await this.repo.upsertBrief(prId, persisted);
    return persisted;
  }

  /** Exactly one model call, with a deterministic-brief fallback on ANY throw,
   *  no key, or an empty/unusable completion. Never lets the LLM call fail the
   *  request — the caller decides whether to persist the fallback. */
  private async tryGenerate(input: {
    workspaceId: string;
    intent: Awaited<ReturnType<Container['reviewRepo']['getIntent']>>;
    blast: Awaited<ReturnType<Container['blast']['blastMapForPr']>>;
    counts: ReturnType<typeof smartDiffCounts>;
    realFiles: Set<string>;
    linkedIssue: Awaited<ReturnType<typeof loadLinkedIssue>>;
    specDocs: Awaited<ReturnType<typeof loadSpecDocs>>;
    findings: FindingInput[];
  }): Promise<{ value: Brief; degraded: boolean }> {
    const fallback = deterministicBrief(input.intent, input.blast);
    try {
      const choice = await resolveFeatureModel(this.container, input.workspaceId, 'risk_brief');
      const llm = await this.container.llm(choice.provider);
      const messages = await buildBriefMessages({
        intent: input.intent,
        blast: input.blast,
        counts: input.counts,
        realFiles: [...input.realFiles],
        linkedIssue: input.linkedIssue,
        specDocs: input.specDocs,
        findings: input.findings,
      });
      const res = await llm.completeStructured({
        model: choice.model,
        schema: BriefProposal,
        schemaName: 'BriefProposal',
        messages,
        temperature: 0.2,
        maxRetries: 1,
      });
      const grounded = groundBrief(res.data, input.realFiles);
      const value: Brief = {
        what: grounded.what,
        why: grounded.why,
        risk_level: deterministicRiskLevel(input.blast),
        risks: grounded.risks,
        review_focus: grounded.review_focus,
      };
      return { value, degraded: false };
    } catch {
      // No key / provider error / empty completion → deterministic fallback.
      return { value: fallback, degraded: true };
    }
  }
}
