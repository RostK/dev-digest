import type { Container } from '../../platform/container.js';
import type { Intent, Provider, UnifiedDiff } from '@devdigest/shared';
import { classifyIntent } from '@devdigest/reviewer-core';
import * as schema from '../../db/schema.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { diffFromPrFiles } from './diff-loader.js';
import { loadLinkedIssue, loadSpecDocs } from '../_shared/pr-body-refs.js';
import type { ReviewRepository, PullRow } from './repository.js';

type RepoRow = typeof schema.repos.$inferSelect;

/**
 * Intent Layer — derives a PR's structured intent (summary + in/out-of-scope)
 * with a cheap, lightweight LLM pass BEFORE the review, persists it per-PR, and
 * (optionally) reports how many tokens were saved by NOT sending diff bodies.
 *
 * I/O lives here (DB via the repository, GitHub + git + LLM via the container);
 * the pure classification prompt lives in @devdigest/reviewer-core. The actual
 * `Intent` shape and the `pr_intent` persistence are the project's existing
 * contracts — this service only wires them together.
 */
export class IntentService {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
  ) {}

  /**
   * Get the stored intent or compute+persist it on first need. Fail-soft: an
   * intent failure NEVER breaks a review — it returns `undefined` and logs.
   */
  async ensureIntent(
    workspaceId: string,
    pull: PullRow,
    repoRow: RepoRow,
    onLog?: (msg: string) => void,
  ): Promise<Intent | undefined> {
    const existing = await this.repo.getIntent(pull.id);
    if (existing) return existing;
    try {
      return await this.compute(workspaceId, pull, repoRow, onLog);
    } catch (err) {
      onLog?.(`intent: classification skipped — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * Force (re)classification: assemble lightweight signals → cheap model →
   * persist. Used by the "Recompute" button and by `ensureIntent` on a miss.
   */
  async compute(
    workspaceId: string,
    pull: PullRow,
    repoRow: RepoRow,
    onLog?: (msg: string) => void,
  ): Promise<Intent> {
    const repoRef = { owner: repoRow.owner, name: repoRow.name };

    // File list + hunk headers ONLY (no change bodies) — reuse the same
    // pr_files reconstruction the reviewer uses for the full diff.
    const diff = await diffFromPrFiles(this.repo, pull.id);
    const files = diff.files.map((f) => ({
      path: f.path,
      hunkHeaders: f.hunks.map(
        (h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
      ),
    }));

    // Best-effort motivation sources (each fail-soft).
    const linkedIssue = await loadLinkedIssue(this.container, repoRef, pull.body);
    const specDocs = await loadSpecDocs(this.container, repoRef, pull.body);

    // Cheap, user-overridable feature model (default: a flash-class OpenRouter
    // model — see FEATURE_MODELS.review_intent).
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, 'review_intent');
    const llm = await this.container.llm(provider as Provider);

    const res = await classifyIntent({
      llm,
      model,
      title: pull.title,
      body: pull.body,
      ...(linkedIssue ? { linkedIssue } : {}),
      ...(specDocs.length ? { specDocs } : {}),
      files,
      sessionId: `${repoRef.owner}/${repoRef.name}#${pull.number}:intent`,
    });

    await this.repo.upsertIntent(pull.id, res.intent);

    this.logSavings(diff, `${provider}/${model}`, res.tokensIn, res.tokensOut, onLog);
    return res.intent;
  }

  /**
   * Log how many tokens the headers-only input saved vs. an intent prompt that
   * had carried the full diff. `diff.raw.length / 4` is the usual rough
   * chars→tokens proxy; we only report a non-negative delta.
   */
  private logSavings(
    diff: UnifiedDiff,
    modelLabel: string,
    tokensIn: number,
    tokensOut: number,
    onLog?: (msg: string) => void,
  ): void {
    if (!onLog) return;
    const estFullDiffTokens = Math.ceil(diff.raw.length / 4);
    const saved = Math.max(0, estFullDiffTokens - tokensIn);
    onLog(
      `intent: classified via ${modelLabel} (${tokensIn}→${tokensOut} tok; ~${saved} tok saved vs full-diff input)`,
    );
  }
}
