import { describe, it, expect } from 'vitest';
import { countUsedBy, computeCoverage, toProjectContextDoc, type AgentDocRow } from '../src/modules/project-context/helpers.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import type { DiscoveredDoc } from '../src/modules/repo-intel/types.js';

/**
 * Pure, DB-free coverage of the project-context module's used_by/coverage
 * counting logic (AC-1, AC-2, AC-21) and the tokenizer count it relies on
 * (AC-17) — the repository's SQL feeding these functions is only exercised via
 * `test/project-context.it.test.ts` (Docker-gated).
 */

describe('countUsedBy', () => {
  it('counts an agent that owns the doc directly', () => {
    const own: AgentDocRow[] = [{ agentId: 'a1', path: 'docs/setup.md' }];
    const inherited: AgentDocRow[] = [];
    expect(countUsedBy(own, inherited)).toEqual(new Map([['docs/setup.md', 1]]));
  });

  it('counts an agent that inherits the doc from an (already-filtered) enabled skill', () => {
    const own: AgentDocRow[] = [];
    const inherited: AgentDocRow[] = [{ agentId: 'a2', path: 'docs/setup.md' }];
    expect(countUsedBy(own, inherited)).toEqual(new Map([['docs/setup.md', 1]]));
  });

  it('does not double-count one agent that both owns AND inherits the same path (own wins, dedupe)', () => {
    const own: AgentDocRow[] = [{ agentId: 'a1', path: 'docs/setup.md' }];
    const inherited: AgentDocRow[] = [
      { agentId: 'a1', path: 'docs/setup.md' }, // same agent, same path, via a skill
    ];
    expect(countUsedBy(own, inherited)).toEqual(new Map([['docs/setup.md', 1]]));
  });

  it('does not double-count one agent inheriting the SAME path from two different skills', () => {
    const own: AgentDocRow[] = [];
    const inherited: AgentDocRow[] = [
      { agentId: 'a1', path: 'docs/setup.md' }, // skill X
      { agentId: 'a1', path: 'docs/setup.md' }, // skill Y — duplicate path, same agent
    ];
    expect(countUsedBy(own, inherited)).toEqual(new Map([['docs/setup.md', 1]]));
  });

  it('sums DISTINCT agents across own + inherited for the same path', () => {
    const own: AgentDocRow[] = [
      { agentId: 'a1', path: 'docs/setup.md' },
      { agentId: 'a2', path: 'specs/SPEC-01.md' },
    ];
    const inherited: AgentDocRow[] = [{ agentId: 'a3', path: 'docs/setup.md' }];

    const counts = countUsedBy(own, inherited);
    expect(counts.get('docs/setup.md')).toBe(2); // a1 (own) + a3 (inherited)
    expect(counts.get('specs/SPEC-01.md')).toBe(1);
  });

  it('returns an empty map for no rows (never throws)', () => {
    expect(countUsedBy([], [])).toEqual(new Map());
  });

  it('a doc nobody references is simply absent from the map (caller treats missing as 0)', () => {
    const counts = countUsedBy([{ agentId: 'a1', path: 'docs/used.md' }], []);
    expect(counts.get('insights/unused.md')).toBeUndefined();
  });
});

describe('computeCoverage', () => {
  it('divides used_by by the total agent count', () => {
    expect(computeCoverage(1, 4)).toBe(0.25);
    expect(computeCoverage(4, 4)).toBe(1);
  });

  it('returns 0 (not NaN/Infinity) when the workspace has no agents', () => {
    expect(computeCoverage(0, 0)).toBe(0);
    expect(computeCoverage(5, 0)).toBe(0); // defensive: shouldn't happen, but never blow up
  });
});

describe('toProjectContextDoc', () => {
  it('maps a discovered doc + computed tokens/usage into the public DTO', () => {
    const doc: DiscoveredDoc = { path: 'specs/SPEC-02.md', badge: 'specs' };
    const dto = toProjectContextDoc(doc, 42, 2, 4);
    expect(dto).toEqual({
      path: 'specs/SPEC-02.md',
      badge: 'specs',
      tokens: 42,
      used_by: 2,
      coverage: 0.5,
    });
  });
});

describe('tokenizer (cl100k_base) — AC-17 grounding', () => {
  it('counts real BPE tokens for known text, not just approx chars/4', () => {
    const tokenizer = new TiktokenTokenizer();
    // "hello world" is 2 cl100k_base tokens — a stable, well-known encoding.
    expect(tokenizer.count('hello world')).toBe(2);
    // Longer text still yields a positive, non-approximated count.
    const text = '# Project Context\n\nThis doc describes the setup for reviewers.';
    const tokens = tokenizer.count(text);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(text.length); // BPE packs more than 1 char/token
  });

  it('counts 0 tokens for an empty/unreadable doc (degraded read)', () => {
    const tokenizer = new TiktokenTokenizer();
    expect(tokenizer.count('')).toBe(0);
  });
});
