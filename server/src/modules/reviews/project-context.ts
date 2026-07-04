import type { Container } from '../../platform/container.js';
import type { RepoRef } from '@devdigest/shared';
import type { EffectiveContextPaths } from '../_shared/project-context.js';
import { isSafeRepoPath } from './helpers.js';

/**
 * run-executor injection of the Project Context prompt slot (SPEC-02 T6).
 *
 * The engine's `PromptParts.specs?: string[]` is pre-wired (reviewer-core is
 * frozen for this task unit) — each element gets `wrapUntrusted`-fenced under
 * one `## Project context` header. What's missing is HERE: turning an agent's
 * effective own/inherited paths (T5's `AgentsRepository.effectiveContextPaths`)
 * into that flat list, grouped own-then-inherited (NC-1·B) so the model can
 * tell "the agent explicitly attached this" from "this came along with a
 * skill" without a schema change to the engine.
 */

/** One successfully-read Project Context doc, tagged with its source path. */
export interface ReadContextDoc {
  path: string;
  content: string;
}

export interface ProjectContextResult {
  /**
   * ≤2 entries — [own docs entry?, inherited docs entry?] — the flat list the
   * engine's `PromptParts.specs` expects. Empty when NEITHER group has a
   * readable doc, so `reviewPullRequest`/`assemblePrompt` omit `## Project
   * context` entirely (AC-11: byte-identical to the pre-feature prompt).
   */
  specs: string[];
  /**
   * Successfully-read paths, own then inherited, in read order. A skipped
   * (unsafe / missing / unreadable) path is EXCLUDED (AC-14) — never logged
   * beyond this list (no doc TEXT here, paths only).
   */
  specsRead: string[];
  /** cl100k_base token count of the full injected `specs` text (AC-15). */
  specsTokens: number;
}

const OWN_LABEL = '// Agent-attached documents';
const INHERITED_LABEL = '// Inherited from skills';

/**
 * Pure grouping/render — NO I/O — split out from `ProjectContextService.build`
 * so it unit-tests without a DB or a git adapter. Groups already-read
 * own/inherited docs into ≤2 flat entries: own FIRST (labeled
 * `// Agent-attached documents`), inherited SECOND (labeled `// Inherited
 * from skills`). Each label is rendered INSIDE its entry so it lands inside
 * the engine's `wrapUntrusted` fence (the engine wraps each `specs[i]`
 * verbatim). An empty group is OMITTED entirely — never an empty-string
 * entry — and order is preserved within each group.
 */
export function buildProjectContextSpecs(
  own: ReadContextDoc[],
  inherited: ReadContextDoc[],
): string[] {
  const specs: string[] = [];
  if (own.length > 0) specs.push(renderGroup(OWN_LABEL, own));
  if (inherited.length > 0) specs.push(renderGroup(INHERITED_LABEL, inherited));
  return specs;
}

function renderGroup(label: string, docs: ReadContextDoc[]): string {
  return [label, ...docs.map((d) => `--- ${d.path} ---\n${d.content}`)].join('\n\n');
}

/**
 * Resolves an agent's effective Project Context into the engine's `specs`
 * slot. I/O lives here (repo clone reads + tokenization); the grouping/render
 * is the pure `buildProjectContextSpecs` above.
 *
 * No LLM/embedding call anywhere (AC-12) — only `container.git.readFile`
 * (clone read) and `container.tokenizer.count` (pure computation).
 */
export class ProjectContextService {
  constructor(private container: Container) {}

  async build(
    repoRef: RepoRef,
    effective: EffectiveContextPaths,
  ): Promise<ProjectContextResult> {
    const clonePath = this.container.git.clonePathFor(repoRef);
    // Full effective set, own then inherited (AC-20: inject everything, never
    // truncate/drop a readable doc).
    const own = await this.readDocs(repoRef, clonePath, effective.own);
    const inherited = await this.readDocs(repoRef, clonePath, effective.inherited);

    const specs = buildProjectContextSpecs(own, inherited);
    const specsRead = [...own, ...inherited].map((d) => d.path);
    const specsTokens = specs.length > 0 ? this.container.tokenizer.count(specs.join('\n\n')) : 0;

    return { specs, specsRead, specsTokens };
  }

  /**
   * Read every path IN ORDER, skipping (never throwing on) an unsafe,
   * missing, empty, or otherwise unreadable file — a single bad doc must
   * never block the run (AC-13). Empty/whitespace-only content is treated the
   * same as "not found" (mirrors `intent-service.ts#loadSpecDocs`, and is
   * what a missing file resolves to via the mock git adapter's `readFile`,
   * which returns `''` instead of throwing).
   */
  private async readDocs(
    repoRef: RepoRef,
    clonePath: string,
    paths: string[],
  ): Promise<ReadContextDoc[]> {
    const out: ReadContextDoc[] = [];
    for (const path of paths) {
      if (!isSafeRepoPath(clonePath, path)) continue;
      try {
        const content = await this.container.git.readFile(repoRef, path);
        if (content && content.trim().length > 0) {
          out.push({ path, content });
        }
      } catch {
        // missing / unreadable — skip; the run proceeds without it (AC-13)
      }
    }
    return out;
  }
}
