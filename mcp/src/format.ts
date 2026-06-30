/**
 * Compact mappers — pure transforms from API contract types to the lean shapes
 * tools expose in their `outputSchema` / `structuredContent`.
 *
 * These mappers drop token-heavy fields (long strings, rarely-needed metadata)
 * while keeping every field a model needs to reason about a review result.
 *
 * All @devdigest/shared imports are type-only: erased at runtime.
 */

import type {
  Agent,
  Finding,
  FindingRecord,
  ReviewRecord,
  ConventionCandidate,
  BlastResponse,
} from '@devdigest/shared';

// ---------------------------------------------------------------------------
// Exported concise types — used by tools for output Zod schemas
// ---------------------------------------------------------------------------

/**
 * Lean agent descriptor (id, name, model, description, enabled).
 * `description` and `model` are kept — they are the cheap, short fields a model
 * reasons over to pick an agent for run_agent_on_pull_request; both are required
 * on the Agent contract. Token-heavy fields (system_prompt, output_schema, …)
 * are still dropped.
 */
export type AgentRef = {
  id: string;
  name: string;
  model: string;
  description: string;
  enabled: boolean;
};

/**
 * A single finding stripped down to the fields needed by the model.
 * Drops: rationale, confidence, category, kind, trifecta_components, evidence.
 */
export type ConciseFinding = {
  severity: Finding['severity'];
  file: string;
  start_line: number;
  end_line: number;
  title: string;
  suggestion: Finding['suggestion'];
};

/**
 * Compact review verdict shape.
 * Drops: id, pr_id, agent_id, run_id, agent_name, kind, model, grounding,
 *        created_at, and per-finding heavy fields.
 */
export type VerdictResult = {
  verdict: ReviewRecord['verdict'];
  summary: ReviewRecord['summary'];
  score: ReviewRecord['score'];
  findings_count: number;
  findings: ConciseFinding[];
};

/**
 * Compact convention shape.
 * Drops: id, evidence_snippet (potentially large), confidence.
 */
export type ConventionRef = {
  category: ConventionCandidate['category'];
  rule: string;
  evidence_path: string;
  evidence_start_line: number | null | undefined;
  evidence_end_line: number | null | undefined;
  accepted: boolean;
};

/**
 * Compact blast-radius shape — the nested map hoisted to the top level with the
 * degraded signal, so a model gets symbols → callers → endpoints plus an honest
 * "index is partial" flag in one object.
 */
export type BlastOutput = {
  summary: string;
  changed_symbols: { name: string; file: string; kind: string }[];
  downstream: {
    symbol: string;
    callers: { name: string; file: string; line: number }[];
    endpoints_affected: string[];
    crons_affected: string[];
  }[];
  degraded: boolean;
  index_status: string | null;
};

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/** Map an Agent to its lean ref (id, name, model, description, enabled). */
export function toAgentRef(a: Agent): AgentRef {
  return {
    id: a.id,
    name: a.name,
    model: a.model,
    description: a.description,
    enabled: a.enabled,
  };
}

/**
 * Map a Finding or FindingRecord to its concise shape.
 * Shared fields are common to both types — no discriminant needed.
 */
export function toConciseFinding(f: Finding | FindingRecord): ConciseFinding {
  return {
    severity: f.severity,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    title: f.title,
    suggestion: f.suggestion,
  };
}

/**
 * Map a ReviewRecord to a compact verdict shape.
 * `findings_count` is derived from the length of the findings array.
 */
export function toVerdict(r: ReviewRecord): VerdictResult {
  return {
    verdict: r.verdict,
    summary: r.summary,
    score: r.score,
    findings_count: r.findings.length,
    findings: r.findings.map(toConciseFinding),
  };
}

/**
 * Map a ConventionCandidate to its lean transport shape.
 * Drops `evidence_snippet` (can be a large code block) and `confidence`.
 */
export function toConvention(c: ConventionCandidate): ConventionRef {
  return {
    category: c.category,
    rule: c.rule,
    evidence_path: c.evidence_path,
    evidence_start_line: c.evidence_start_line,
    evidence_end_line: c.evidence_end_line,
    accepted: c.accepted,
  };
}

/**
 * Map a BlastResponse to the compact tool output: the nested map hoisted with
 * the degraded/index-status signal.
 */
export function toBlastOutput(res: BlastResponse): BlastOutput {
  return {
    summary: res.blast.summary,
    changed_symbols: res.blast.changed_symbols,
    downstream: res.blast.downstream,
    degraded: res.degraded ?? false,
    index_status: res.index_status ?? null,
  };
}
