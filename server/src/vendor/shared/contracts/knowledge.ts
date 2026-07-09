import { z } from 'zod';
import { Severity, FindingCategory } from './findings.js';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
  // Free-text "why this matters" note. Model-authored.
  rationale: z.string().nullish(),
  // Deterministic "used by N routes/callers" count, filled by the SERVER from
  // repo-intel blast-radius AFTER generation — nullish so LLM output validates
  // before the count is attached (never model-authored — see AC-12).
  used_by: z.number().int().nullish(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

export const OnboardingJobStatus = z.object({
  job_id: z.string(),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  error: z.string().nullish(),
});
export type OnboardingJobStatus = z.infer<typeof OnboardingJobStatus>;

export const OnboardingResponse = z.object({
  tour: Onboarding.nullable(),
  generated_at: z.string().nullable(),
  files_indexed: z.number().int(),
  indexed: z.boolean(),
  stale: z.boolean(),
  job: OnboardingJobStatus.nullish(),
});
export type OnboardingResponse = z.infer<typeof OnboardingResponse>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

/**
 * A single expected finding within an `EvalExpectation`. Reuses the shared
 * `Severity`/`FindingCategory` enums (see `./findings.js`) so an eval case's
 * expectation is checkable against a real `Finding` without a parallel enum.
 */
export const EvalExpectedFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  severity: Severity.nullish(),
  category: FindingCategory.nullish(),
  title: z.string().nullish(),
});
export type EvalExpectedFinding = z.infer<typeof EvalExpectedFinding>;

/**
 * The grounded, checkable shape of `EvalCase.expected_output` (tightened from
 * `z.unknown()`). `must_find` asserts the agent SHOULD raise a finding matching
 * each entry in `findings`; `must_not_flag` asserts it should NOT raise a
 * finding at any of those locations (a negative/no-false-positive case).
 */
export const EvalExpectation = z.object({
  kind: z.enum(['must_find', 'must_not_flag']),
  findings: z.array(EvalExpectedFinding),
});
export type EvalExpectation = z.infer<typeof EvalExpectation>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: EvalExpectation,
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// An immutable body snapshot captured in `skill_versions` whenever a skill's
// body changes (metadata-only / enabled edits don't bump). Mirrors the agents
// versioning pattern, but a skill only versions its body (the prompt text).
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

// Result of parsing an uploaded markdown file or .zip for import: ONLY the skill
// body text is extracted (the executable part of an archive is never read or
// run). Surfaced as a preview the user must explicitly confirm before saving.
export const SkillImportPreview = z.object({
  name: z.string(),
  body: z.string(),
  ignored_files: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

// ---- Conventions ----
// Coarse buckets a convention falls into. Used to group accepted candidates when
// the user chooses "split into one skill per category".
export const ConventionCategory = z.enum([
  'naming',
  'error_handling',
  'structure',
  'imports',
  'typing',
  'testing',
  'async',
  'style',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

export const ConventionCandidate = z.object({
  id: z.string(),
  category: ConventionCategory,
  rule: z.string(),
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  // 1-based inclusive line range of `evidence_snippet` within `evidence_path`,
  // derived from the ACTUAL file during grounding (not the model's claim) so a
  // deep-link always lands on real code. Null only for legacy/ungrounded rows.
  evidence_start_line: z.number().int().nullish(),
  evidence_end_line: z.number().int().nullish(),
  confidence: z.number().min(0).max(1),
  accepted: z.boolean(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  // Per-binding toggle: the skill is attached to the agent but only fed into the
  // review prompt when enabled (AND the skill itself is globally enabled).
  enabled: z.boolean(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;

// ---- Project Context ----
// Which source folder a project-context doc was pulled from — drives the badge
// shown next to each doc in the context picker UI.
export const ContextBadge = z.enum(['specs', 'docs', 'insights']);
export type ContextBadge = z.infer<typeof ContextBadge>;

export const ProjectContextDoc = z.object({
  path: z.string().min(1),
  badge: ContextBadge,
  tokens: z.number().int().min(0),
  used_by: z.number().int().min(0),
  // 0..1 ratio; the client renders it as a %.
  coverage: z.number().min(0).max(1),
});
export type ProjectContextDoc = z.infer<typeof ProjectContextDoc>;

export const ContextAttachment = z.object({
  path: z.string().min(1),
  order: z.number().int().min(0),
});
export type ContextAttachment = z.infer<typeof ContextAttachment>;
