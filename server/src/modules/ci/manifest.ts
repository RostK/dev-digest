// Pure agent -> AgentManifest builder + YAML (de)serialization for the
// Export-to-CI bundle (SPEC-07 T2). No DB/adapter/container/fs/network — the
// caller (a later unit's ci/service.ts) resolves the agent + its enabled
// skills and passes plain data in.

import { stringify } from 'yaml';
import { AgentManifest } from '../../vendor/shared/contracts/eval-ci.js';
import { DEVDIGEST_DIR } from './constants.js';
import { slugify } from './slug.js';

/**
 * Minimal agent shape this module needs — deliberately NOT the full `Agent`
 * db row/contract, to keep this module decoupled from persistence. A caller
 * with an `agents` row or the `Agent` zod contract can pass it directly
 * (both are structurally compatible with this).
 */
export interface ManifestAgentInput {
  name: string;
  systemPrompt: string;
  model: string;
  strategy: 'auto' | 'single-pass' | 'map-reduce';
  ciFailOn: 'never' | 'critical' | 'warning' | 'any';
}

/** An enabled skill linked to the agent — enough to slug + emit its file. */
export interface ManifestSkillInput {
  name: string;
  body: string;
}

/**
 * Map an agent + its enabled skills to the `AgentManifest` contract shape
 * shared with the CI runner. `provider` is FORCED to `'openrouter'` — the
 * runner authenticates with a single `OPENROUTER_API_KEY` CI secret, so the
 * exported manifest can never request a different provider. Never includes
 * any API key / secret / credential field.
 */
export function buildManifest(
  agent: ManifestAgentInput,
  enabledSkills: ManifestSkillInput[],
): AgentManifest {
  return AgentManifest.parse({
    name: agent.name,
    provider: 'openrouter',
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: enabledSkills.map((s) => slugify(s.name)),
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  });
}

/**
 * Serialize a manifest to YAML using the real `yaml` library (not hand
 * concatenation) so a multiline `system_prompt` becomes a proper block
 * scalar that survives a round trip: `AgentManifest.parse(YAML.parse(x))`
 * deep-equals the input.
 */
export function manifestToYaml(manifest: AgentManifest): string {
  return stringify(manifest);
}

/**
 * The enabled-skill file map for the bundle: one `.devdigest/skills/<slug>.md`
 * entry per enabled skill (POSIX `/` — this is a repo path, not a host path).
 */
export function skillFiles(
  enabledSkills: ManifestSkillInput[],
): { path: string; body: string }[] {
  return enabledSkills.map((s) => ({
    path: `${DEVDIGEST_DIR}/skills/${slugify(s.name)}.md`,
    body: s.body,
  }));
}
