import type { Brief } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { loadLinkedIssue, loadSpecDocs } from '../_shared/pr-body-refs.js';
import { MAX_SPEC_CHARS_BRIEF } from './constants.js';
import { BriefRepository } from './repository.js';
import {
  BriefProposal,
  buildBriefMessages,
  deterministicBrief,
  groundBrief,
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
    const brief = await this.repo.getBrief(prId);
    // Staleness: a brief carries the head SHA it was generated against. Once the
    // PR gets a new commit, that SHA no longer matches the pull's current head —
    // the brief is out of date, so hide it (null) and let the UI offer Generate.
    // Legacy briefs (no head_sha) are shown as-is; their staleness is unknowable.
    if (brief?.head_sha && brief.head_sha !== pull.headSha) return null;
    return brief;
  }

  /** Generate (or regenerate) the brief for a PR. Exactly ONE `container.llm`
   *  call on the happy path; falls back to a deterministic brief on any
   *  failure (AC-8), persisting the fallback only when no brief exists yet.
   *  `onLog` is optional and fail-soft (mirrors `IntentService.ensureIntent`) —
   *  a caller with a request-scoped logger (e.g. `req.log`) can pass one in;
   *  omitting it only loses observability, never behavior. */
  async generateBrief(
    workspaceId: string,
    prId: string,
    onLog?: (msg: string) => void,
  ): Promise<Brief> {
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
    // Brief's own cap (4_000), applied ONCE here — distinct from the
    // intent-service caller, which keeps the loader's 8_000 default.
    const specDocs = repoRef
      ? await loadSpecDocs(this.container, repoRef, pull.body, MAX_SPEC_CHARS_BRIEF)
      : [];

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

    const brief = await this.tryGenerate(
      {
        workspaceId,
        intent,
        blast,
        counts,
        realFiles,
        linkedIssue,
        specDocs,
        findings,
      },
      onLog,
    );

    const persisted: Brief = {
      ...brief.value,
      generated_at: new Date().toISOString(),
      // Pin the brief to the commit it describes so a later commit invalidates it.
      head_sha: pull.headSha,
    };

    if (!brief.degraded) {
      // Non-degraded generation ALWAYS overwrites (AC-6: an explicit
      // Regenerate always wins).
      await this.repo.upsertBrief(prId, persisted);
      return persisted;
    }

    // Degraded generation: no-clobber is ATOMIC at the repository
    // (`insertBriefIfAbsent` = INSERT … ON CONFLICT DO NOTHING) — no
    // read-then-write window for a concurrent request to race.
    const wrote = await this.repo.insertBriefIfAbsent(prId, persisted);
    if (wrote) return persisted;

    // A good brief already existed — kept it, degraded generation discarded.
    onLog?.('brief: regenerate degraded — kept existing good brief');
    const existing = await this.repo.getBrief(prId);
    // A concurrent delete (or a malformed persisted blob failing the read-
    // boundary parse) could make `existing` null even though the insert
    // reported a conflict — don't assert non-null; fall back to returning
    // this freshly-computed degraded value so the caller always gets a
    // valid Brief instead of a runtime crash.
    return existing ?? persisted;
  }

  /** Exactly one model call, with a deterministic-brief fallback on ANY throw,
   *  no key, or an empty/unusable completion. Never lets the LLM call fail the
   *  request — the caller decides whether to persist the fallback. */
  private async tryGenerate(
    input: {
      workspaceId: string;
      intent: Awaited<ReturnType<Container['reviewRepo']['getIntent']>>;
      blast: Awaited<ReturnType<Container['blast']['blastMapForPr']>>;
      counts: ReturnType<typeof smartDiffCounts>;
      realFiles: Set<string>;
      linkedIssue: Awaited<ReturnType<typeof loadLinkedIssue>>;
      specDocs: Awaited<ReturnType<typeof loadSpecDocs>>;
      findings: FindingInput[];
    },
    onLog?: (msg: string) => void,
  ): Promise<{ value: Brief; degraded: boolean }> {
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
        risk_level: grounded.risk_level,
        risks: grounded.risks,
        review_focus: grounded.review_focus,
      };
      return { value, degraded: false };
    } catch (err) {
      // No key / provider error / empty completion → deterministic fallback.
      // Log (fail-soft, no throw) so a real provider outage is distinguishable
      // from a missing key instead of silently degrading — mirrors
      // IntentService.ensureIntent's fail-soft catch. Never logs secrets.
      onLog?.(`brief: generation degraded — ${(err as Error).message}`);
      return { value: fallback, degraded: true };
    }
  }
}
