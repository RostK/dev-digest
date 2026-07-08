import { describe, it, expect } from 'vitest';
import type { AgentRunRow, FindingRow } from '../../db/rows.js';
import {
  buildConflicts,
  calcAgentEstimate,
  calcMultiAgentEstimate,
  mapAgentColumn,
  rangesOverlap,
  type ColumnSource,
} from './helpers.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let seq = 0;
function makeRun(overrides: Partial<AgentRunRow> = {}): AgentRunRow {
  seq += 1;
  return {
    id: `run-${seq}`,
    workspaceId: 'ws-1',
    agentId: `agent-${seq}`,
    prId: 'pr-1',
    multiAgentRunId: null,
    ranAt: new Date('2026-07-08T00:00:00.000Z'),
    provider: 'openai',
    model: 'gpt-4.1',
    durationMs: 5000,
    tokensIn: 1000,
    tokensOut: 500,
    status: 'done',
    error: null,
    source: 'local',
    findingsCount: 0,
    grounding: '1/1 passed',
    score: 80,
    blockers: 0,
    ...overrides,
  };
}

function makeFinding(overrides: Partial<FindingRow> = {}): FindingRow {
  seq += 1;
  return {
    id: `f-${seq}`,
    reviewId: 'review-1',
    file: 'src/config.ts',
    startLine: 10,
    endLine: 12,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded secret',
    rationale: 'A secret is committed in source.',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifectaComponents: null,
    acceptedAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

function source(overrides: Partial<ColumnSource> & { agentName?: string } = {}): ColumnSource {
  return {
    run: makeRun(),
    agentName: 'Agent',
    review: { verdict: 'comment', summary: 'ok' },
    findings: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// rangesOverlap
// ---------------------------------------------------------------------------

describe('rangesOverlap', () => {
  it('is true for overlapping ranges (inclusive bounds)', () => {
    expect(rangesOverlap(10, 12, 11, 15)).toBe(true);
    expect(rangesOverlap(10, 10, 10, 10)).toBe(true);
  });

  it('is false for disjoint ranges', () => {
    expect(rangesOverlap(10, 12, 13, 15)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mapAgentColumn (AC-9)
// ---------------------------------------------------------------------------

describe('mapAgentColumn', () => {
  it('a running agent has status "running" and a null score/duration/cost', () => {
    const run = makeRun({ status: 'running', durationMs: null, tokensIn: null, tokensOut: null, score: null });
    const column = mapAgentColumn({ run, agentName: 'Sec', review: undefined, findings: [] });
    expect(column.status).toBe('running');
    expect(column.score).toBeNull();
    expect(column.duration_ms).toBeNull();
    expect(column.cost_usd).toBeNull();
    expect(column.verdict).toBeNull();
    expect(column.summary).toBeNull();
  });

  it('a failed agent has status "failed", null score, but its elapsed duration and no cost', () => {
    const run = makeRun({ status: 'failed', durationMs: 1200, tokensIn: 0, tokensOut: 0, score: null });
    const column = mapAgentColumn({ run, agentName: 'Sec', review: undefined, findings: [] });
    expect(column.status).toBe('failed');
    expect(column.score).toBeNull();
    expect(column.duration_ms).toBe(1200);
    // Never fabricate $0.00 for a non-done run, even with tokens present.
    expect(column.cost_usd).toBeNull();
  });

  it('a done agent maps its review + findings, and derives a real cost', () => {
    const run = makeRun({ status: 'done', score: 65 });
    const finding = makeFinding({ id: 'f-valid', startLine: 11, endLine: 11 });
    const column = mapAgentColumn({
      run,
      agentName: 'Security Reviewer',
      review: { verdict: 'request_changes', summary: 'Found a secret' },
      findings: [finding],
    });
    expect(column.status).toBe('done');
    expect(column.agent_name).toBe('Security Reviewer');
    expect(column.verdict).toBe('request_changes');
    expect(column.summary).toBe('Found a secret');
    expect(column.score).toBe(65);
    expect(column.findings).toHaveLength(1);
    expect(column.findings[0]!.id).toBe('f-valid');
    expect(column.findings[0]!.start_line).toBe(11);
    // gpt-4.1 is priced in the table — a done run with real tokens gets a real cost.
    expect(column.cost_usd).not.toBeNull();
    expect(column.cost_usd).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildConflicts (AC-15/16/17) — deterministic, no LLM
// ---------------------------------------------------------------------------

describe('buildConflicts', () => {
  it('two agents flagging an overlapping range group into ONE conflict with a take per agent (attribution retained, AC-17)', () => {
    const a = source({
      run: makeRun({ agentId: 'agent-a', status: 'done' }),
      agentName: 'Security',
      findings: [makeFinding({ file: 'src/x.ts', startLine: 10, endLine: 12, severity: 'CRITICAL' })],
    });
    const b = source({
      run: makeRun({ agentId: 'agent-b', status: 'done' }),
      agentName: 'Performance',
      findings: [makeFinding({ file: 'src/x.ts', startLine: 11, endLine: 11, severity: 'WARNING' })],
    });

    const conflicts = buildConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    const [conflict] = conflicts;
    expect(conflict!.file).toBe('src/x.ts');
    expect(conflict!.takes).toHaveLength(2);
    const agentIds = conflict!.takes.map((t) => t.agent_id).sort();
    expect(agentIds).toEqual(['agent-a', 'agent-b']);
    // divergent severities across the two takes
    const verdicts = conflict!.takes.map((t) => t.verdict).sort();
    expect(verdicts).toEqual(['CRITICAL', 'WARNING']);
  });

  it('an identical duplicate finding at the SAME location groups ONCE, not once per finding', () => {
    const a = source({
      run: makeRun({ agentId: 'agent-a' }),
      findings: [makeFinding({ file: 'src/x.ts', startLine: 10, endLine: 10 })],
    });
    const b = source({
      run: makeRun({ agentId: 'agent-b' }),
      findings: [makeFinding({ file: 'src/x.ts', startLine: 10, endLine: 10 })],
    });
    const conflicts = buildConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
  });

  it('a DONE agent with no overlapping finding gets an explicit "did not flag" take', () => {
    const a = source({
      run: makeRun({ agentId: 'agent-a', status: 'done' }),
      agentName: 'Security',
      findings: [makeFinding({ file: 'src/y.ts', startLine: 5, endLine: 5 })],
    });
    const b = source({
      run: makeRun({ agentId: 'agent-b', status: 'done' }),
      agentName: 'Performance',
      findings: [], // reviewed the PR, found nothing at src/y.ts:5
    });

    const conflicts = buildConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    const bTake = conflicts[0]!.takes.find((t) => t.agent_id === 'agent-b');
    expect(bTake).toBeDefined();
    expect(bTake!.verdict).toBe('ignored');
    expect(bTake!.note.length).toBeGreaterThan(0);
  });

  it('a single-agent-only location (no other DONE agent in the run) forms NO group', () => {
    const onlyAgent = source({
      run: makeRun({ agentId: 'agent-a', status: 'done' }),
      findings: [makeFinding({ file: 'src/z.ts', startLine: 1, endLine: 1 })],
    });
    expect(buildConflicts([onlyAgent])).toEqual([]);
  });

  it('a running/failed sibling never contributes a "did not flag" take (only DONE agents do)', () => {
    const a = source({
      run: makeRun({ agentId: 'agent-a', status: 'done' }),
      findings: [makeFinding({ file: 'src/w.ts', startLine: 1, endLine: 1 })],
    });
    const stillRunning = source({ run: makeRun({ agentId: 'agent-b', status: 'running' }), findings: [] });
    const failed = source({ run: makeRun({ agentId: 'agent-c', status: 'failed' }), findings: [] });

    expect(buildConflicts([a, stillRunning, failed])).toEqual([]);
  });

  it('divergent severities at the same overlapping range are retained per-take (not collapsed)', () => {
    const a = source({
      run: makeRun({ agentId: 'agent-a' }),
      findings: [makeFinding({ file: 'src/x.ts', startLine: 20, endLine: 22, severity: 'CRITICAL' })],
    });
    const b = source({
      run: makeRun({ agentId: 'agent-b' }),
      findings: [makeFinding({ file: 'src/x.ts', startLine: 21, endLine: 21, severity: 'SUGGESTION' })],
    });
    const conflicts = buildConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    const severities = conflicts[0]!.takes.map((t) => t.verdict);
    expect(new Set(severities).size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// calcAgentEstimate / calcMultiAgentEstimate (AC-5/AC-6)
// ---------------------------------------------------------------------------

describe('calcAgentEstimate', () => {
  it('averages duration + cost over past done runs (AC-5)', () => {
    const history = [
      makeRun({ durationMs: 4000, tokensIn: 1000, tokensOut: 500 }),
      makeRun({ durationMs: 6000, tokensIn: 1000, tokensOut: 500 }),
    ];
    const est = calcAgentEstimate('agent-1', history);
    expect(est.has_history).toBe(true);
    expect(est.duration_ms).toBe(5000);
    expect(est.cost_usd).not.toBeNull();
    expect(est.cost_usd).toBeGreaterThan(0);
  });

  it('no usable past runs → null · no history (AC-6), never a fabricated number', () => {
    const est = calcAgentEstimate('agent-2', []);
    expect(est).toEqual({ agent_id: 'agent-2', duration_ms: null, cost_usd: null, has_history: false });
  });
});

describe('calcMultiAgentEstimate', () => {
  it('aggregates duration as the MAX (concurrent) and cost as the SUM across agents with history', () => {
    const agents = [
      { agent_id: 'a1', duration_ms: 4000, cost_usd: 0.1, has_history: true },
      { agent_id: 'a2', duration_ms: 8000, cost_usd: 0.2, has_history: true },
    ];
    const est = calcMultiAgentEstimate(agents);
    expect(est.summary.duration_ms).toBe(8000);
    expect(est.summary.cost_usd).toBeCloseTo(0.3);
    expect(est.summary.partial).toBe(false);
  });

  it('excludes a no-history agent from the aggregate and marks it partial (AC-6)', () => {
    const agents = [
      { agent_id: 'a1', duration_ms: 4000, cost_usd: 0.1, has_history: true },
      { agent_id: 'a2', duration_ms: null, cost_usd: null, has_history: false },
    ];
    const est = calcMultiAgentEstimate(agents);
    expect(est.summary.duration_ms).toBe(4000);
    expect(est.summary.cost_usd).toBeCloseTo(0.1);
    expect(est.summary.partial).toBe(true);
    // The excluded agent is still listed (client renders "— · no history" for it).
    expect(est.agents).toHaveLength(2);
  });

  it('all agents lacking history → null summary, marked partial', () => {
    const agents = [
      { agent_id: 'a1', duration_ms: null, cost_usd: null, has_history: false },
      { agent_id: 'a2', duration_ms: null, cost_usd: null, has_history: false },
    ];
    const est = calcMultiAgentEstimate(agents);
    expect(est.summary.duration_ms).toBeNull();
    expect(est.summary.cost_usd).toBeNull();
    expect(est.summary.partial).toBe(true);
  });
});
