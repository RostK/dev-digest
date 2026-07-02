import { Onboarding, type ChatMessage, type OnboardingLink, type OnboardingSection } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { renderPrompt } from '../../platform/prompts.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  ONBOARDING_SECTIONS,
  ONBOARDING_DEFAULT_LANGUAGE,
  ONBOARDING_MAX_KEY_FILES,
  ONBOARDING_EXCERPT_CHARS,
  ONBOARDING_TOP_FILES_COUNT,
  ONBOARDING_MAX_LINKS_PER_SECTION,
  SETUP_FACT_FILENAMES,
} from './constants.js';

/**
 * Deterministic fact assembly + prompt building for the onboarding generator.
 * Mirrors conventions/service.ts's sampling (config files + top-ranked source)
 * and blast/summary.ts's single-call shape. Every read here is a BOUNDED
 * repo-intel facade call or a capped clone read — never a full-tree walk
 * (AC-7, AC-8).
 */

export interface KeyFileExcerpt {
  path: string;
  content: string;
  /** file_rank percentile (0 when unranked / not yet indexed). */
  rank: number;
}

export interface SetupFactFile {
  path: string;
  content: string;
}

export interface OnboardingFacts {
  repoMap: string;
  keyFiles: KeyFileExcerpt[];
  criticalPaths: string[][];
  setupFacts: SetupFactFile[];
  filesIndexed: number;
}

/** Reject absolute / drive / URL / traversal paths before any clone read. */
function isSafeRelativePath(p: string): boolean {
  if (!p || p.startsWith('/') || p.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(p) || /^[a-z]+:\/\//i.test(p)) return false;
  if (p.split(/[\\/]/).some((seg) => seg === '..' || seg === '')) return false;
  return true;
}

function truncate(content: string, max = ONBOARDING_EXCERPT_CHARS): string {
  return content.length <= max ? content : `${content.slice(0, max)}\n… (truncated)`;
}

/**
 * Deterministic repo-intel facade reads + a CAPPED set of clone reads. NEVER
 * walks the whole tree: key files are the top-N ranked paths (already capped
 * by repo-intel + `ONBOARDING_MAX_KEY_FILES` here), and setup facts are a
 * small fixed filename list (AC-7, AC-8).
 */
export async function collectFacts(
  container: Container,
  repo: { id: string; owner: string; name: string; clonePath: string | null },
): Promise<OnboardingFacts> {
  const ref = { owner: repo.owner, name: repo.name };

  const [repoMapResult, topFiles, criticalPaths, indexState] = await Promise.all([
    container.repoIntel.getRepoMap(repo.id),
    container.repoIntel.getTopFilesByRank(repo.id, ONBOARDING_TOP_FILES_COUNT),
    container.repoIntel.getCriticalPaths(repo.id),
    container.repoIntel.getIndexState(repo.id),
  ]);

  const ranks = topFiles.length > 0 ? await container.repoIntel.getFileRank(repo.id, topFiles) : [];
  const rankByPath = new Map(ranks.map((r) => [r.path, r.percentile]));

  const keyFiles: KeyFileExcerpt[] = [];
  if (repo.clonePath) {
    for (const path of topFiles.slice(0, ONBOARDING_MAX_KEY_FILES)) {
      if (!isSafeRelativePath(path)) continue;
      try {
        const content = await container.git.readFile(ref, path);
        if (content.trim().length > 0) {
          keyFiles.push({ path, content: truncate(content), rank: rankByPath.get(path) ?? 0 });
        }
      } catch {
        // unreadable / missing in the clone — skip (never throw on one file)
      }
    }
  }

  const setupFacts: SetupFactFile[] = [];
  if (repo.clonePath) {
    for (const filename of SETUP_FACT_FILENAMES) {
      if (!isSafeRelativePath(filename)) continue;
      try {
        const content = await container.git.readFile(ref, filename);
        if (content.trim().length > 0) {
          setupFacts.push({ path: filename, content: truncate(content) });
        }
      } catch {
        // file doesn't exist in this repo — skip
      }
    }
  }

  return {
    repoMap: repoMapResult.text,
    keyFiles,
    criticalPaths,
    setupFacts,
    filesIndexed: indexState.filesIndexed,
  };
}

function renderCriticalPaths(chains: string[][]): string {
  if (chains.length === 0) return '(no dependency graph available yet)';
  return chains.map((chain, i) => `${i + 1}. ${chain.join(' → ')}`).join('\n');
}

function renderKeyFiles(files: KeyFileExcerpt[]): string {
  return files
    .map((f) => `### ${f.path} (rank percentile: ${f.rank})\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');
}

function renderSetupFacts(files: SetupFactFile[]): string {
  return files.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n');
}

/** The `{{sections}}` slot — the canonical five, in order, with a one-line hint. */
function renderSectionSpec(): string {
  return ONBOARDING_SECTIONS.map(
    (s, i) =>
      `${i + 1}. \`${s.kind}\` — "${s.title}": ${s.hint}${s.diagramAllowed ? ' (diagram allowed)' : ''}`,
  ).join('\n');
}

/**
 * Assemble the (system, user) messages for the ONE completeStructured call.
 * Every repo-derived block is `wrapUntrusted`-fenced (AC-16) — the repo
 * skeleton, dependency chains, key-file contents, and setup-file contents all
 * originate in the target repository and must never be treated as instructions.
 */
export async function buildMessages(facts: OnboardingFacts): Promise<ChatMessage[]> {
  const system = await renderPrompt('onboarding.system.md', {
    sections: renderSectionSpec(),
    language: ONBOARDING_DEFAULT_LANGUAGE,
  });

  const userParts: string[] = [
    `## Files indexed\n${facts.filesIndexed}`,
    `## Repo skeleton\n${wrapUntrusted('repo-map', facts.repoMap || '(no repo-map cached yet)')}`,
    `## Dependency chains (critical / reading path)\n${wrapUntrusted(
      'critical-paths',
      renderCriticalPaths(facts.criticalPaths),
    )}`,
  ];
  if (facts.keyFiles.length > 0) {
    userParts.push(`## Key file excerpts\n${wrapUntrusted('key-files', renderKeyFiles(facts.keyFiles))}`);
  }
  if (facts.setupFacts.length > 0) {
    userParts.push(
      `## Setup facts (package manifest / compose / env example / README)\n${wrapUntrusted(
        'setup-facts',
        renderSetupFacts(facts.setupFacts),
      )}`,
    );
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n\n') },
  ];
}

/**
 * Fill `used_by` on the Critical-paths section's links from `getBlastRadius`
 * — a deterministic "used by N routes" count, NEVER model-authored (AC-12).
 * A link whose `path` isn't a real indexed file just resolves to 0 routes
 * (`getBlastRadius` degrades to an empty result; it never throws for an
 * unknown path).
 */
export async function fillUsedBy(
  container: Container,
  repoId: string,
  onboarding: Onboarding,
): Promise<Onboarding> {
  const sections: OnboardingSection[] = await Promise.all(
    onboarding.sections.map(async (section) => {
      if (section.kind !== 'critical_paths' || section.links.length === 0) return section;
      const links: OnboardingLink[] = await Promise.all(
        section.links.map(async (link): Promise<OnboardingLink> => {
          try {
            const result = await container.repoIntel.getBlastRadius(repoId, [link.path]);
            return { ...link, used_by: new Set(result.impactedEndpoints).size };
          } catch {
            return { ...link, used_by: link.used_by ?? null };
          }
        }),
      );
      return { ...section, links };
    }),
  );
  return { sections };
}

/**
 * Normalize model output to EXACTLY the canonical five sections, in order
 * (AC-3): fills in any section the model omitted, strips a `diagram` from any
 * section other than `architecture`, and caps links per section.
 */
export function normalizeToCanonicalFive(onboarding: Onboarding): Onboarding {
  const byKind = new Map(onboarding.sections.map((s) => [s.kind, s]));
  return {
    sections: ONBOARDING_SECTIONS.map((def): OnboardingSection => {
      const found = byKind.get(def.kind);
      if (!found) {
        return { kind: def.kind, title: def.title, body: '', diagram: null, links: [] };
      }
      return {
        kind: def.kind,
        title: found.title || def.title,
        body: found.body,
        diagram: def.diagramAllowed ? (found.diagram ?? null) : null,
        links: found.links.slice(0, ONBOARDING_MAX_LINKS_PER_SECTION),
      };
    }),
  };
}

/**
 * Model-free fallback tour (AC-18) — mirrors blast/summary.ts's
 * `deterministicSummary`: always a VALID `Onboarding`, grounded only in facts
 * already collected (never an invented path). The caller decides whether to
 * persist it (never overwriting an existing good tour — see service.ts).
 */
export function buildDeterministicSkeleton(facts: OnboardingFacts): Onboarding {
  const readingChain = facts.criticalPaths[0] ?? [];
  return {
    sections: ONBOARDING_SECTIONS.map((def): OnboardingSection => {
      switch (def.kind) {
        case 'architecture':
          return {
            kind: def.kind,
            title: def.title,
            body: facts.repoMap
              ? `Repo skeleton (from the index):\n\n\`\`\`\n${facts.repoMap.slice(0, 800)}\n\`\`\``
              : `Indexed ${facts.filesIndexed} file(s). Regenerate once a model is configured for a full write-up.`,
            diagram: null,
            links: [],
          };
        case 'critical_paths':
          return {
            kind: def.kind,
            title: def.title,
            body:
              facts.criticalPaths.length > 0
                ? 'The most-imported files, in dependency order (deterministic, from the index):'
                : 'No dependency graph is available yet.',
            diagram: null,
            links: facts.criticalPaths.slice(0, ONBOARDING_MAX_LINKS_PER_SECTION).map((chain) => {
              const path = chain[chain.length - 1] ?? chain[0]!;
              return { label: path, path, rationale: null, used_by: null };
            }),
          };
        case 'how_to_run':
          return {
            kind: def.kind,
            title: def.title,
            body:
              facts.setupFacts.length > 0
                ? `Setup files found: ${facts.setupFacts.map((f) => f.path).join(', ')}. Review them for exact run steps.`
                : 'No setup files (package.json, docker-compose, .env.example, README) were found in the clone.',
            diagram: null,
            links: facts.setupFacts
              .slice(0, ONBOARDING_MAX_LINKS_PER_SECTION)
              .map((f) => ({ label: f.path, path: f.path, rationale: null, used_by: null })),
          };
        case 'reading_path':
          return {
            kind: def.kind,
            title: def.title,
            body:
              readingChain.length > 0
                ? 'Suggested reading order, derived from the dependency graph:'
                : 'No dependency graph is available yet.',
            diagram: null,
            links: readingChain
              .slice(0, ONBOARDING_MAX_LINKS_PER_SECTION)
              .map((path) => ({ label: path, path, rationale: null, used_by: null })),
          };
        case 'first_tasks':
        default:
          return {
            kind: def.kind,
            title: def.title,
            body: 'First tasks need a model — regenerate the tour once one is configured.',
            diagram: null,
            links: [],
          };
      }
    }),
  };
}

/**
 * Make the ONE completeStructured call for the tour (AC-6: schema `Onboarding`,
 * model from `resolveFeatureModel('onboarding')`), falling back to the
 * deterministic skeleton on ANY failure — missing key, provider error, or an
 * empty/malformed completion (AC-18). A standalone function (not a service
 * method) so it unit-tests with a fake `Container`, mirroring
 * blast/summary.ts's `summarize()`.
 */
export async function generateOnboarding(
  container: Container,
  workspaceId: string,
  facts: OnboardingFacts,
): Promise<{ onboarding: Onboarding; usedFallback: boolean }> {
  const fallback = buildDeterministicSkeleton(facts);
  try {
    const choice = await resolveFeatureModel(container, workspaceId, 'onboarding');
    const llm = await container.llm(choice.provider);
    const messages = await buildMessages(facts);
    const res = await llm.completeStructured({
      model: choice.model,
      schema: Onboarding,
      schemaName: 'Onboarding',
      messages,
      temperature: 0.3,
      maxRetries: 1,
    });
    if (!res.data.sections || res.data.sections.length === 0) {
      return { onboarding: fallback, usedFallback: true };
    }
    return { onboarding: res.data, usedFallback: false };
  } catch {
    // Missing key / provider error / timeout / bad schema → deterministic skeleton.
    return { onboarding: fallback, usedFallback: true };
  }
}

/**
 * AC-18's persistence guard: the fallback skeleton must NEVER overwrite an
 * already-good tour. A real generation always persists; a fallback only
 * persists when there's nothing to protect yet (first-ever generate).
 */
export function shouldPersistGeneration(usedFallback: boolean, hasExistingTour: boolean): boolean {
  return !usedFallback || !hasExistingTour;
}
