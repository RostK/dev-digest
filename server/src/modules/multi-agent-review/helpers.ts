/**
 * Pure helpers for the Multi-Agent Review service (side-effect free; operate
 * purely on their arguments — no DB / network / `this`). Owns:
 *   - the AgentColumn mapper (agent_run + review + findings → AgentColumn)
 *   - the deterministic conflict builder (AC-15/16/17) — NO LLM call
 *   - the pre-run estimate calculators (AC-5/AC-6)
 */
import type {
  AgentColumn,
  AgentColumnFinding,
  AgentEstimate,
  Conflict,
  ConflictTake,
  MultiAgentEstimate,
  Severity,
} from '@devdigest/shared';
import { runCostUsd } from '../../adapters/llm/pricing.js';
import type { AgentRunRow, FindingRow } from '../../db/rows.js';

// ---------------------------------------------------------------------------
// AgentColumn mapping (AC-9)
// ---------------------------------------------------------------------------

/** Everything needed to map ONE agent's linked run into an `AgentColumn`, and
 *  (grouped with its siblings) to feed the conflict builder below. */
export interface ColumnSource {
  run: AgentRunRow;
  agentName: string | null;
  /** The review this run produced (verdict/summary). Undefined when the run
   *  never got that far (e.g. failed before persisting a review). */
  review: { verdict: string | null; summary: string | null } | undefined;
  /** This run's persisted, already-grounded findings (full rows — carries
   *  `endLine`, unlike the narrower `AgentColumnFinding` contract shape). */
  findings: FindingRow[];
}

function toColumnStatus(status: string | null): AgentColumn['status'] {
  if (status === 'done') return 'done';
  // 'cancelled' has no dedicated column state in the contract — a cancelled
  // multi-agent lane reads the same as a failed one (no score, done fanning out).
  if (status === 'failed' || status === 'cancelled') return 'failed';
  return 'running';
}

function toColumnFinding(row: FindingRow): AgentColumnFinding {
  return {
    id: row.id,
    severity: row.severity as Severity,
    category: row.category,
    title: row.title,
    file: row.file,
    start_line: row.startLine,
    kind: row.kind ?? null,
  };
}

/** Map one linked `agent_run` (+ its review + findings) into its `AgentColumn`. */
export function mapAgentColumn(src: ColumnSource): AgentColumn {
  const { run, agentName, review, findings } = src;
  const status = toColumnStatus(run.status);
  return {
    run_id: run.id,
    // agentId is nullable on the row (set null if the agent was later deleted);
    // the contract wants a non-null string — empty string is the documented
    // degraded case (out of scope for this feature: agents aren't deleted
    // mid-multi-run in practice).
    agent_id: run.agentId ?? '',
    agent_name: agentName ?? 'Unknown agent',
    provider: run.provider,
    model: run.model,
    status,
    verdict: review?.verdict ?? null,
    score: run.score,
    summary: review?.summary ?? null,
    duration_ms: run.durationMs,
    // Per-run cost is DERIVED at read-time, never stored, and null (not $0.00)
    // for anything other than a completed run (server/INSIGHTS.md 2026-06-16),
    // matching the existing `listRunsForPull` convention.
    cost_usd: status === 'done' ? runCostUsd(run.model, run.tokensIn, run.tokensOut) : null,
    findings: findings.map(toColumnFinding),
  };
}

// ---------------------------------------------------------------------------
// Conflict builder (AC-15/16/17) — deterministic, NO LLM call
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

interface LocatedFinding {
  agentId: string;
  persona: string;
  file: string;
  startLine: number;
  endLine: number;
  severity: Severity;
  title: string;
}

/**
 * Local range-overlap check with the SAME semantics as reviewer-core's
 * `rangeIntersects` (reviewer-core/src/grounding.ts:41) — reimplemented here
 * because that helper is unexported and reviewer-core is frozen (no edits).
 * Two INCLUSIVE ranges overlap iff each start is ≤ the other's end.
 */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function collectFindings(sources: ColumnSource[]): LocatedFinding[] {
  const out: LocatedFinding[] = [];
  for (const src of sources) {
    const agentId = src.run.agentId ?? '';
    const persona = src.agentName ?? 'Unknown agent';
    for (const f of src.findings) {
      out.push({
        agentId,
        persona,
        file: f.file,
        startLine: f.startLine,
        endLine: f.endLine,
        severity: f.severity as Severity,
        title: f.title,
      });
    }
  }
  return out;
}

/**
 * Cluster findings into groups sharing the same `file` and an overlapping
 * `[start_line, end_line]` range. A finding joins the first cluster it
 * overlaps with ANY existing member of (transitive-by-membership, not just
 * the cluster's first finding) — findings per PR are few, so this simple
 * O(n²) pass is plenty fast and keeps the logic easy to audit.
 */
function clusterByLocation(findings: LocatedFinding[]): LocatedFinding[][] {
  const clusters: LocatedFinding[][] = [];
  for (const finding of findings) {
    const target = clusters.find((cluster) =>
      cluster.some(
        (m) =>
          m.file === finding.file &&
          rangesOverlap(m.startLine, m.endLine, finding.startLine, finding.endLine),
      ),
    );
    if (target) target.push(finding);
    else clusters.push([finding]);
  }
  return clusters;
}

/**
 * Build the "Where agents disagree" groups (AC-15/16/17) from every column's
 * persisted, already-grounded findings — pure and deterministic, NO model
 * call. A group is emitted only when AT LEAST 2 selected agents have a take
 * at that location: ≥2 agents flagged it (whatever their severities — a
 * divergent-severity case is just an instance of "≥2 flagged"), OR ≥1 agent
 * flagged it and ≥1 OTHER agent completed its review without flagging that
 * spot (an explicit "did not flag" take, `verdict: 'ignored'`). A location
 * only ONE agent ever had a take at (nobody else reviewed, or reviewed and
 * simply didn't reach that finding) forms NO group.
 */
export function buildConflicts(sources: ColumnSource[]): Conflict[] {
  const findings = collectFindings(sources);
  if (findings.length === 0) return [];

  // Only a COMPLETED ('done') agent can meaningfully be said to have "reviewed
  // but not flagged" a location — a still-running or failed agent never
  // finished forming a verdict there.
  const doneAgents = sources
    .filter((s) => s.run.status === 'done')
    .map((s) => ({ agentId: s.run.agentId ?? '', persona: s.agentName ?? 'Unknown agent' }));

  const clusters = clusterByLocation(findings);
  const conflicts: Conflict[] = [];

  for (const cluster of clusters) {
    const flaggingAgentIds = new Set(cluster.map((f) => f.agentId));
    const nonFlaggingDone = doneAgents.filter((a) => !flaggingAgentIds.has(a.agentId));

    // ≥2-take rule: skip a location only ONE agent has a take at.
    const takeCount = flaggingAgentIds.size + nonFlaggingDone.length;
    if (takeCount < 2) continue;

    const takes: ConflictTake[] = [];
    for (const agentId of flaggingAgentIds) {
      const flags = cluster.filter((f) => f.agentId === agentId);
      // One take per agent even if it has >1 overlapping finding in this
      // cluster — surface its highest-severity finding as the representative take.
      const worst = flags.reduce((a, b) => (SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a));
      takes.push({ agent_id: agentId, persona: worst.persona, verdict: worst.severity, note: worst.title });
    }
    for (const agent of nonFlaggingDone) {
      takes.push({
        agent_id: agent.agentId,
        persona: agent.persona,
        verdict: 'ignored',
        note: 'Reviewed this location but did not flag it.',
      });
    }

    // Anchor the group's file:line:title on its FIRST-encountered finding
    // (stable across calls given the same input order — no randomness).
    const anchor = cluster[0]!;
    conflicts.push({ file: anchor.file, line: anchor.startLine, title: anchor.title, takes });
  }

  return conflicts;
}

// ---------------------------------------------------------------------------
// Pre-run estimate (AC-5/AC-6) — derived from an agent's own past agent_runs
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * One agent's typical `time · cost`, derived from its own past COMPLETED
 * (`status='done'`) runs. `history` is expected pre-filtered to done runs
 * (the repository's `agentRunHistory` already does this) — an empty list
 * means "no usable history" (never run, or only failed runs), which renders
 * `— · no history` and is EXCLUDED from the summary aggregate (AC-6), never a
 * fabricated number.
 */
export function calcAgentEstimate(agentId: string, history: AgentRunRow[]): AgentEstimate {
  if (history.length === 0) {
    return { agent_id: agentId, duration_ms: null, cost_usd: null, has_history: false };
  }
  const durations = history.map((r) => r.durationMs).filter((d): d is number => d != null);
  const costs = history
    .map((r) => runCostUsd(r.model, r.tokensIn, r.tokensOut))
    .filter((c): c is number => c != null);
  return {
    agent_id: agentId,
    duration_ms: durations.length ? Math.round(mean(durations)) : null,
    cost_usd: costs.length ? mean(costs) : null,
    has_history: true,
  };
}

/**
 * Aggregate a selected set of per-agent estimates into the summary shown
 * before a multi-run launches. Agents with `has_history: false` are EXCLUDED
 * from both the duration and cost aggregate; `partial` flags that at least
 * one selected agent contributed no number (AC-6). The agents run
 * CONCURRENTLY, so the summary duration is the MAX (not the sum) of the
 * known per-agent durations — matching `total_duration_ms` at read time
 * (AC-8) — while cost is the SUM (each agent burns its own tokens).
 */
export function calcMultiAgentEstimate(agents: AgentEstimate[]): MultiAgentEstimate {
  const withHistory = agents.filter((a) => a.has_history);
  const durations = withHistory.map((a) => a.duration_ms).filter((d): d is number => d != null);
  const costs = withHistory.map((a) => a.cost_usd).filter((c): c is number => c != null);
  return {
    agents,
    summary: {
      duration_ms: durations.length ? Math.max(...durations) : null,
      cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      partial: withHistory.length < agents.length,
    },
  };
}
