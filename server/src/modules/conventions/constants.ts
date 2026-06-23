import type { FeatureModelChoice } from '@devdigest/shared';

/**
 * Conventions extractor tunables. Sampling is 100% deterministic code (no model):
 * a fixed set of repo-root config files + the top source files by rank.
 */

/** How many top-ranked source files to feed the model (alongside the configs). */
export const SAMPLE_FILE_COUNT = 12;

/** Per-file char budget when building the prompt (a HEAD prefix, so the line
 *  numbers the model can cite stay aligned with the real file). */
export const MAX_FILE_CHARS = 6_000;

/**
 * Repo-root config files read verbatim (whichever exist) — they encode a lot of
 * a project's conventions on their own (lint rules, strictness, formatting).
 */
export const CONFIG_FILENAMES = [
  'package.json',
  'tsconfig.json',
  'tsconfig.base.json',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  'prettier.config.js',
  'prettier.config.cjs',
  '.editorconfig',
] as const;

/**
 * Default model for the extractor when the workspace hasn't picked one in
 * Settings. Deliberately CHEAP — extraction is a coarse, high-volume pass over
 * whole files, not a precise diff review. (`gpt-4.1`, same provider as reviews
 * so it works with the OpenAI key the app already needs.)
 */
export const CONVENTIONS_DEFAULT_MODEL: FeatureModelChoice = {
  provider: 'openai',
  model: 'gpt-4.1',
};
