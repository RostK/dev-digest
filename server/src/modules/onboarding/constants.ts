/**
 * Onboarding tour generator — tunables + the canonical section taxonomy.
 * Sampling/reads are 100% deterministic (facade calls + a capped clone read);
 * the model only ever gets ONE completeStructured call (see service.ts).
 */

/** Job kind for the (re)generation job, registered on JobRunner. */
export const ONBOARDING_JOB_KIND = 'onboarding-generate';

/**
 * Re-exported so the rest of this module imports job kinds from ONE local
 * place. This is the accepted cross-module CONSTANT import (repos/service.ts
 * imports the same pair directly) — never repo-intel's SERVICE.
 */
export { INDEX_JOB_KIND, REFRESH_JOB_KIND, RESYNC_JOB_KIND } from '../repo-intel/constants.js';

/**
 * The canonical five onboarding sections, in prompt + render order (AC-3).
 * `hint` feeds the `{{sections}}` slot of `prompts/onboarding.system.md`;
 * `diagramAllowed` is enforced again server-side in `normalizeToCanonicalFive`
 * so a model-added diagram on any other section is always stripped.
 */
export interface OnboardingSectionDef {
  kind: string;
  title: string;
  hint: string;
  diagramAllowed: boolean;
}

export const ONBOARDING_SECTIONS: readonly OnboardingSectionDef[] = [
  {
    kind: 'architecture',
    title: 'Architecture overview',
    hint: 'How the pieces fit together — include ONE mermaid diagram.',
    diagramAllowed: true,
  },
  {
    kind: 'critical_paths',
    title: 'Critical paths',
    hint: 'The most important files to know, each with a one-line rationale.',
    diagramAllowed: false,
  },
  {
    kind: 'how_to_run',
    title: 'How to run locally',
    hint: 'Numbered, copyable shell steps grounded in the provided setup facts.',
    diagramAllowed: false,
  },
  {
    kind: 'reading_path',
    title: 'Guided reading path',
    hint: 'The order to read files in, each with a short "why".',
    diagramAllowed: false,
  },
  {
    kind: 'first_tasks',
    title: 'First tasks',
    hint: 'A few concrete starter tasks for a new contributor.',
    diagramAllowed: false,
  },
] as const;

/** No workspace language setting exists yet — write tours in English (v1). */
export const ONBOARDING_DEFAULT_LANGUAGE = 'English';

/** Cap on ranked key-file excerpts fed to the model — bounded input (AC-8). */
export const ONBOARDING_MAX_KEY_FILES = 8;

/** Per-file character budget for key-file / setup-fact excerpts. */
export const ONBOARDING_EXCERPT_CHARS = 4_000;

/** How many top-ranked files `getTopFilesByRank` returns before the key-file cap. */
export const ONBOARDING_TOP_FILES_COUNT = 12;

/** Max links normalized per section — mirrors the prompt's "up to 4 links" rule. */
export const ONBOARDING_MAX_LINKS_PER_SECTION = 4;

/**
 * Repo-root setup files read verbatim (whichever exist in the clone) — grounds
 * the "How to run locally" section (AC-13). A small fixed list, not a walk.
 */
export const SETUP_FACT_FILENAMES = [
  'package.json',
  'docker-compose.yml',
  'docker-compose.yaml',
  '.env.example',
  'README.md',
] as const;
