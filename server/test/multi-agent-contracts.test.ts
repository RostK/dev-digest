import { describe, it, expect } from 'vitest';
import {
  MultiAgentRunRequest,
  AgentEstimate,
  MultiAgentEstimate,
  MultiAgentRunListItem,
  MultiAgentRun,
} from '@devdigest/shared';

/**
 * SPEC-06 T1 — round-trip the new Multi-Agent Review contracts (dual-vendored,
 * AC-19). The `client/src/vendor/shared/contracts/observability.ts` copy is
 * asserted diff-identical to this one out-of-band (a plain file diff), not
 * re-parsed here — both packages resolve `@devdigest/shared` to THEIR OWN
 * vendor copy, so there is no shared runtime module to import from a server
 * test.
 */
describe('MultiAgentRunRequest', () => {
  it('parses a valid start body (selected agent ids)', () => {
    const parsed = MultiAgentRunRequest.parse({ agent_ids: ['a1', 'a2', 'a3'] });
    expect(parsed.agent_ids).toEqual(['a1', 'a2', 'a3']);
  });

  it('rejects an empty agent_ids array', () => {
    expect(() => MultiAgentRunRequest.parse({ agent_ids: [] })).toThrow();
  });

  it('rejects a missing agent_ids field', () => {
    expect(() => MultiAgentRunRequest.parse({})).toThrow();
  });
});

describe('AgentEstimate', () => {
  it('parses an agent WITH history', () => {
    const parsed = AgentEstimate.parse({
      agent_id: 'a1',
      duration_ms: 8200,
      cost_usd: 0.12,
      has_history: true,
    });
    expect(parsed.has_history).toBe(true);
    expect(parsed.duration_ms).toBe(8200);
  });

  it('parses an agent with NO usable history — null time/cost (AC-6)', () => {
    const parsed = AgentEstimate.parse({
      agent_id: 'a2',
      duration_ms: null,
      cost_usd: null,
      has_history: false,
    });
    expect(parsed.has_history).toBe(false);
    expect(parsed.duration_ms).toBeNull();
    expect(parsed.cost_usd).toBeNull();
  });

  it('rejects a missing has_history field', () => {
    expect(() =>
      AgentEstimate.parse({ agent_id: 'a1', duration_ms: 100, cost_usd: 0.01 }),
    ).toThrow();
  });
});

describe('MultiAgentEstimate', () => {
  it('parses a full estimate with a partial summary (AC-6)', () => {
    const parsed = MultiAgentEstimate.parse({
      agents: [
        { agent_id: 'a1', duration_ms: 8200, cost_usd: 0.12, has_history: true },
        { agent_id: 'a2', duration_ms: null, cost_usd: null, has_history: false },
      ],
      summary: { duration_ms: 8200, cost_usd: 0.12, partial: true },
    });
    expect(parsed.agents).toHaveLength(2);
    expect(parsed.summary.partial).toBe(true);
  });

  it('rejects a summary missing the partial flag', () => {
    expect(() =>
      MultiAgentEstimate.parse({
        agents: [],
        summary: { duration_ms: null, cost_usd: null },
      }),
    ).toThrow();
  });
});

describe('MultiAgentRunListItem', () => {
  it('parses a history row', () => {
    const parsed = MultiAgentRunListItem.parse({
      id: 'm1',
      ran_at: '2026-07-08T00:00:00.000Z',
      agent_count: 3,
      total_duration_ms: 8200,
      total_cost_usd: 0.36,
    });
    expect(parsed.agent_count).toBe(3);
  });

  it('allows null totals (e.g. an all-failed multi-run)', () => {
    const parsed = MultiAgentRunListItem.parse({
      id: 'm1',
      ran_at: '2026-07-08T00:00:00.000Z',
      agent_count: 2,
      total_duration_ms: null,
      total_cost_usd: null,
    });
    expect(parsed.total_duration_ms).toBeNull();
  });
});

describe('MultiAgentRun.estimate backward compatibility (AC-19)', () => {
  const baseRun = {
    id: 'm1',
    pr_id: 'pr1',
    ran_at: '2026-07-08T00:00:00.000Z',
    agent_count: 2,
    total_duration_ms: 8200,
    total_cost_usd: 0.24,
    columns: [],
    conflicts: [],
  };

  it('parses WITHOUT an estimate field — old rows / pre-field shape stay valid', () => {
    const parsed = MultiAgentRun.parse(baseRun);
    expect(parsed.estimate).toBeUndefined();
  });

  it('parses with estimate: null', () => {
    const parsed = MultiAgentRun.parse({ ...baseRun, estimate: null });
    expect(parsed.estimate).toBeNull();
  });

  it('parses with a full estimate object', () => {
    const parsed = MultiAgentRun.parse({
      ...baseRun,
      estimate: {
        agents: [{ agent_id: 'a1', duration_ms: 8200, cost_usd: 0.24, has_history: true }],
        summary: { duration_ms: 8200, cost_usd: 0.24, partial: false },
      },
    });
    expect(parsed.estimate?.summary.partial).toBe(false);
  });

  it('rejects a malformed estimate (wrong shape)', () => {
    expect(() => MultiAgentRun.parse({ ...baseRun, estimate: { agents: 'nope' } })).toThrow();
  });
});
