/**
 * Pure effective-context resolver (`modules/_shared/project-context.ts`) — AC-7
 * dedupe: agent-own paths win over skill-inherited ones, and among inherited paths
 * only the first occurrence (by position) survives. No I/O, no DB.
 */
import { describe, it, expect } from 'vitest';
import { resolveEffectiveContextPaths } from '../src/modules/_shared/project-context.js';

describe('resolveEffectiveContextPaths', () => {
  it('drops an own doc from inherited when the same path is also attached via a skill', () => {
    const result = resolveEffectiveContextPaths(['specs/invariants.md'], ['specs/invariants.md', 'docs/architecture.md']);

    expect(result.own).toEqual(['specs/invariants.md']);
    expect(result.inherited).toEqual(['docs/architecture.md']);
  });

  it('keeps a doc contributed by two skills at its first position (deduped)', () => {
    const result = resolveEffectiveContextPaths([], ['docs/shared.md', 'docs/skill-a-only.md', 'docs/shared.md']);

    expect(result.inherited).toEqual(['docs/shared.md', 'docs/skill-a-only.md']);
  });

  it('preserves ordering within each returned list', () => {
    const own = ['specs/c.md', 'specs/a.md', 'specs/b.md'];
    const inherited = ['docs/z.md', 'docs/y.md', 'docs/x.md'];

    const result = resolveEffectiveContextPaths(own, inherited);

    expect(result.own).toEqual(['specs/c.md', 'specs/a.md', 'specs/b.md']);
    expect(result.inherited).toEqual(['docs/z.md', 'docs/y.md', 'docs/x.md']);
  });
});
