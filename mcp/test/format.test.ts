/**
 * Tests for format.ts — toAgentRef, toConciseFinding, toVerdict, toConvention.
 *
 * Verifies that each mapper:
 *  (a) keeps exactly the intended fields, and
 *  (b) drops the heavy/token-expensive ones.
 *
 * All @devdigest/shared imports are type-only.
 */

import { describe, it, expect } from 'vitest';
import {
  toAgentRef,
  toConciseFinding,
  toVerdict,
  toConvention,
} from '../src/format.js';
import type { Agent, Finding, FindingRecord, ReviewRecord, ConventionCandidate } from '@devdigest/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AGENT: Agent = {
  id: 'agent-1',
  name: 'Security Reviewer',
  description: 'Finds security issues in PRs',
  provider: 'openai',
  model: 'gpt-4o',
  system_prompt: 'You are a security reviewer. (very long prompt...)',
  output_schema: { type: 'object', properties: {} },
  enabled: true,
  version: 3,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
};

const FINDING: Finding = {
  id: 'finding-1',
  severity: 'CRITICAL',
  category: 'security',
  title: 'SQL injection vulnerability',
  file: 'src/db/queries.ts',
  start_line: 42,
  end_line: 47,
  rationale:
    'The query concatenates user input directly, enabling SQL injection. ' +
    'This is a detailed explanation that takes many tokens.',
  suggestion: 'Use parameterized queries.',
  confidence: 0.97,
  kind: 'finding',
  trifecta_components: null,
  evidence: null,
};

const FINDING_RECORD: FindingRecord = {
  ...FINDING,
  id: 'finding-2',
  severity: 'WARNING',
  review_id: 'review-1',
  accepted_at: null,
  dismissed_at: null,
};

const REVIEW_RECORD: ReviewRecord = {
  id: 'review-1',
  pr_id: 'pr-uuid',
  agent_id: 'agent-1',
  run_id: 'run-uuid',
  agent_name: 'Security Reviewer',
  kind: 'review',
  verdict: 'request_changes',
  summary: 'Found critical security issues.',
  score: 20,
  model: 'gpt-4o',
  grounding: 'All findings grounded in diff.',
  created_at: '2024-01-01T00:00:00Z',
  findings: [FINDING_RECORD],
};

const CONVENTION: ConventionCandidate = {
  id: 'conv-1',
  category: 'naming',
  rule: 'Use camelCase for variable names',
  evidence_path: 'src/utils/helpers.ts',
  evidence_snippet:
    'const fooBar = doSomething();\nconst bazQux = doOther();\n// (very long snippet)',
  evidence_start_line: 10,
  evidence_end_line: 15,
  confidence: 0.92,
  accepted: true,
};

// ---------------------------------------------------------------------------
// toAgentRef
// ---------------------------------------------------------------------------

describe('toAgentRef', () => {
  it('keeps id, name, model, description, and enabled', () => {
    const ref = toAgentRef(AGENT);

    expect(ref.id).toBe('agent-1');
    expect(ref.name).toBe('Security Reviewer');
    expect(ref.model).toBe('gpt-4o');
    expect(ref.description).toBe('Finds security issues in PRs');
    expect(ref.enabled).toBe(true);
  });

  it('drops provider, system_prompt, output_schema, version, strategy, ci_fail_on, repo_intel', () => {
    const ref = toAgentRef(AGENT) as Record<string, unknown>;

    expect(ref['provider']).toBeUndefined();
    expect(ref['system_prompt']).toBeUndefined();
    expect(ref['output_schema']).toBeUndefined();
    expect(ref['version']).toBeUndefined();
    expect(ref['strategy']).toBeUndefined();
    expect(ref['ci_fail_on']).toBeUndefined();
    expect(ref['repo_intel']).toBeUndefined();
  });

  it('has exactly 5 keys', () => {
    const ref = toAgentRef(AGENT);
    expect(Object.keys(ref)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// toConciseFinding
// ---------------------------------------------------------------------------

describe('toConciseFinding — from Finding', () => {
  it('keeps severity, file, start_line, end_line, title, suggestion', () => {
    const concise = toConciseFinding(FINDING);

    expect(concise.severity).toBe('CRITICAL');
    expect(concise.file).toBe('src/db/queries.ts');
    expect(concise.start_line).toBe(42);
    expect(concise.end_line).toBe(47);
    expect(concise.title).toBe('SQL injection vulnerability');
    expect(concise.suggestion).toBe('Use parameterized queries.');
  });

  it('drops rationale, confidence, category, kind, trifecta_components, evidence', () => {
    const concise = toConciseFinding(FINDING) as Record<string, unknown>;

    expect(concise['rationale']).toBeUndefined();
    expect(concise['confidence']).toBeUndefined();
    expect(concise['category']).toBeUndefined();
    expect(concise['kind']).toBeUndefined();
    expect(concise['trifecta_components']).toBeUndefined();
    expect(concise['evidence']).toBeUndefined();
  });

  it('has exactly 6 keys', () => {
    const concise = toConciseFinding(FINDING);
    expect(Object.keys(concise)).toHaveLength(6);
  });
});

describe('toConciseFinding — from FindingRecord', () => {
  it('works with a FindingRecord (extends Finding)', () => {
    const concise = toConciseFinding(FINDING_RECORD);

    expect(concise.severity).toBe('WARNING');
    expect(concise.file).toBe('src/db/queries.ts');
  });

  it('drops FindingRecord-specific fields (review_id, accepted_at, dismissed_at)', () => {
    const concise = toConciseFinding(FINDING_RECORD) as Record<string, unknown>;

    expect(concise['review_id']).toBeUndefined();
    expect(concise['accepted_at']).toBeUndefined();
    expect(concise['dismissed_at']).toBeUndefined();
  });
});

describe('toConciseFinding — suggestion field handling', () => {
  it('preserves null suggestion', () => {
    const finding: Finding = { ...FINDING, suggestion: null };
    expect(toConciseFinding(finding).suggestion).toBeNull();
  });

  it('preserves undefined/absent suggestion', () => {
    const finding: Finding = { ...FINDING, suggestion: undefined };
    expect(toConciseFinding(finding).suggestion).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toVerdict
// ---------------------------------------------------------------------------

describe('toVerdict', () => {
  it('maps verdict, summary, score from the ReviewRecord', () => {
    const v = toVerdict(REVIEW_RECORD);

    expect(v.verdict).toBe('request_changes');
    expect(v.summary).toBe('Found critical security issues.');
    expect(v.score).toBe(20);
  });

  it('sets findings_count to the length of the findings array', () => {
    const v = toVerdict(REVIEW_RECORD);

    expect(v.findings_count).toBe(1);
  });

  it('maps findings through toConciseFinding', () => {
    const v = toVerdict(REVIEW_RECORD);

    expect(v.findings).toHaveLength(1);
    expect(v.findings[0]?.severity).toBe('WARNING');
    expect(v.findings[0]?.title).toBe('SQL injection vulnerability');
  });

  it('drops id, pr_id, agent_id, run_id, agent_name, kind, model, grounding, created_at', () => {
    const v = toVerdict(REVIEW_RECORD) as Record<string, unknown>;

    expect(v['id']).toBeUndefined();
    expect(v['pr_id']).toBeUndefined();
    expect(v['agent_id']).toBeUndefined();
    expect(v['run_id']).toBeUndefined();
    expect(v['agent_name']).toBeUndefined();
    expect(v['kind']).toBeUndefined();
    expect(v['model']).toBeUndefined();
    expect(v['grounding']).toBeUndefined();
    expect(v['created_at']).toBeUndefined();
  });

  it('handles an empty findings array', () => {
    const review: ReviewRecord = { ...REVIEW_RECORD, findings: [] };
    const v = toVerdict(review);

    expect(v.findings).toHaveLength(0);
    expect(v.findings_count).toBe(0);
  });

  it('handles nullable verdict and summary', () => {
    const review: ReviewRecord = {
      ...REVIEW_RECORD,
      verdict: null,
      summary: null,
      score: null,
    };
    const v = toVerdict(review);

    expect(v.verdict).toBeNull();
    expect(v.summary).toBeNull();
    expect(v.score).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toConvention
// ---------------------------------------------------------------------------

describe('toConvention', () => {
  it('keeps category, rule, evidence_path, evidence_start_line, evidence_end_line, accepted', () => {
    const c = toConvention(CONVENTION);

    expect(c.category).toBe('naming');
    expect(c.rule).toBe('Use camelCase for variable names');
    expect(c.evidence_path).toBe('src/utils/helpers.ts');
    expect(c.evidence_start_line).toBe(10);
    expect(c.evidence_end_line).toBe(15);
    expect(c.accepted).toBe(true);
  });

  it('drops evidence_snippet (potentially large code block)', () => {
    const c = toConvention(CONVENTION) as Record<string, unknown>;

    expect(c['evidence_snippet']).toBeUndefined();
  });

  it('drops confidence', () => {
    const c = toConvention(CONVENTION) as Record<string, unknown>;

    expect(c['confidence']).toBeUndefined();
  });

  it('drops id', () => {
    const c = toConvention(CONVENTION) as Record<string, unknown>;

    expect(c['id']).toBeUndefined();
  });

  it('has exactly 6 keys', () => {
    const c = toConvention(CONVENTION);
    expect(Object.keys(c)).toHaveLength(6);
  });

  it('preserves nullish line numbers', () => {
    const convention: ConventionCandidate = {
      ...CONVENTION,
      evidence_start_line: null,
      evidence_end_line: undefined,
    };
    const c = toConvention(convention);

    expect(c.evidence_start_line).toBeNull();
    expect(c.evidence_end_line).toBeUndefined();
  });
});
