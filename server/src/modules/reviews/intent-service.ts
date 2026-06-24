import type { Container } from '../../platform/container.js';
import type { Intent, Provider, UnifiedDiff } from '@devdigest/shared';
import { classifyIntent } from '@devdigest/reviewer-core';
import * as schema from '../../db/schema.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { diffFromPrFiles } from './diff-loader.js';
import type { ReviewRepository, PullRow } from './repository.js';

type RepoRow = typeof schema.repos.$inferSelect;

/** Extensions we'll read as inline spec/plan context from the cloned repo. */
const SPEC_EXTS = ['md', 'mdx', 'txt', 'rst'];
/** Cap on referenced spec docs + per-doc size, so the lean prompt stays lean. */
const MAX_SPEC_DOCS = 3;
const MAX_SPEC_CHARS = 8_000;

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
    const linkedIssue = await this.loadLinkedIssue(repoRef, pull.body);
    const specDocs = await this.loadSpecDocs(repoRef, pull.body);

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

    this.logSavings(diff, res.tokensIn, res.tokensOut, onLog);
    return res.intent;
  }

  /**
   * Parse the FIRST `#N` reference from the PR body (closes/fixes/resolves/
   * spec/plan/ref or bare) and fetch that issue's body. Returns undefined when
   * there's no reference, no GitHub token, or the fetch fails.
   */
  private async loadLinkedIssue(
    repoRef: { owner: string; name: string },
    body: string | null,
  ): Promise<{ number: number; title: string; body?: string | null } | undefined> {
    if (!body) return undefined;
    const m = body.match(/(?:closes|fixes|resolves|spec|plan|ref|issue)?\s*#(\d+)/i);
    const n = m?.[1] ? Number(m[1]) : NaN;
    if (!Number.isInteger(n) || n <= 0) return undefined;
    try {
      const gh = await this.container.github();
      const issue = await gh.getIssue(repoRef, n);
      return { number: issue.number, title: issue.title, body: issue.body };
    } catch {
      return undefined; // no token / offline / not found — degrade gracefully
    }
  }

  /**
   * Read in-repo spec/plan files referenced by path in the PR body (e.g.
   * `docs/specs/foo.md`) from the cloned working tree. Path-traversal-guarded
   * (no `..`, no absolute / drive paths, allowlisted extensions), capped, and
   * each read fail-soft. NEVER fetches external URLs.
   */
  private async loadSpecDocs(
    repoRef: { owner: string; name: string },
    body: string | null,
  ): Promise<{ path: string; content: string }[]> {
    if (!body) return [];
    const candidates = new Set<string>();
    // Markdown link targets: [text](path)
    for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) if (m[1]) candidates.add(m[1]);
    // Bare path tokens ending in a spec-ish extension.
    const extAlt = SPEC_EXTS.join('|');
    for (const m of body.matchAll(new RegExp(`(?:^|\\s)([\\w./-]+\\.(?:${extAlt}))\\b`, 'gi'))) {
      if (m[1]) candidates.add(m[1]);
    }

    const out: { path: string; content: string }[] = [];
    for (const raw of candidates) {
      if (out.length >= MAX_SPEC_DOCS) break;
      const rel = raw.trim();
      if (!this.isSafeRepoPath(rel)) continue;
      try {
        const content = await this.container.git.readFile(repoRef, rel);
        if (content && content.trim().length > 0) {
          out.push({ path: rel, content: content.slice(0, MAX_SPEC_CHARS) });
        }
      } catch {
        // referenced file not in the clone (or repo not cloned yet) — skip
      }
    }
    return out;
  }

  /** Reject absolute paths, drive letters, `..` traversal, URLs, and non-spec extensions. */
  private isSafeRepoPath(p: string): boolean {
    if (!p || p.startsWith('/') || p.startsWith('\\')) return false;
    if (/^[a-zA-Z]:/.test(p) || /^[a-z]+:\/\//i.test(p)) return false; // drive / url
    if (p.split(/[\\/]/).some((seg) => seg === '..')) return false;
    const ext = p.split('.').pop()?.toLowerCase() ?? '';
    return SPEC_EXTS.includes(ext);
  }

  /**
   * Log how many tokens the headers-only input saved vs. an intent prompt that
   * had carried the full diff. `diff.raw.length / 4` is the usual rough
   * chars→tokens proxy; we only report a non-negative delta.
   */
  private logSavings(
    diff: UnifiedDiff,
    tokensIn: number,
    tokensOut: number,
    onLog?: (msg: string) => void,
  ): void {
    if (!onLog) return;
    const estFullDiffTokens = Math.ceil(diff.raw.length / 4);
    const saved = Math.max(0, estFullDiffTokens - tokensIn);
    onLog(
      `intent: classified (${tokensIn}→${tokensOut} tok; ~${saved} tok saved vs full-diff input)`,
    );
  }
}
