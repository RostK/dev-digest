import { describe, it, expect } from 'vitest';
import {
  locateSnippet,
  normalizeEvidencePath,
  toConventionDto,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRow } from '../src/modules/conventions/repository.js';

/**
 * Hermetic tests for the extractor's grounding core — no DB, no LLM. This is the
 * gate that keeps a candidate only when its snippet is REALLY in the file.
 */

describe('locateSnippet', () => {
  const file = ['import x from "y";', 'export const a = 1;', 'function foo() {', '  return a;', '}'].join(
    '\n',
  );

  it('finds a single line (1-based)', () => {
    expect(locateSnippet(file, 'export const a = 1;')).toEqual({ start: 2, end: 2 });
  });

  it('finds a consecutive multi-line block', () => {
    expect(locateSnippet(file, 'function foo() {\n  return a;\n}')).toEqual({ start: 3, end: 5 });
  });

  it('is tolerant of indentation / whitespace', () => {
    expect(locateSnippet(file, '   export    const a = 1;   ')).toEqual({ start: 2, end: 2 });
  });

  it('anchors on the first line when the rest does not match', () => {
    expect(locateSnippet(file, 'function foo() {\n  totally different')).toEqual({
      start: 3,
      end: 3,
    });
  });

  it('returns null when the snippet is not present (ungrounded → dropped)', () => {
    expect(locateSnippet(file, 'const banana = 42;')).toBeNull();
  });

  it('returns null for an empty snippet', () => {
    expect(locateSnippet(file, '   \n  ')).toBeNull();
  });
});

describe('normalizeEvidencePath', () => {
  it('strips a leading ./, quotes, and a trailing line ref', () => {
    expect(normalizeEvidencePath('./src/a.ts')).toBe('src/a.ts');
    expect(normalizeEvidencePath('`src/a.ts`')).toBe('src/a.ts');
    expect(normalizeEvidencePath('src/a.ts:23')).toBe('src/a.ts');
    expect(normalizeEvidencePath('src/a.ts:23-31')).toBe('src/a.ts');
  });

  it('converts backslashes to posix separators', () => {
    expect(normalizeEvidencePath('src\\b\\c.ts')).toBe('src/b/c.ts');
  });
});

describe('toConventionDto', () => {
  const base: ConventionRow = {
    id: 'c1',
    workspaceId: 'w1',
    repoId: 'r1',
    category: 'naming',
    rule: 'Use camelCase',
    evidencePath: 'src/a.ts',
    evidenceSnippet: 'const fooBar = 1;',
    evidenceStartLine: 5,
    evidenceEndLine: 5,
    confidence: 0.9,
    accepted: false,
  };

  it('maps a row to the snake_case DTO', () => {
    expect(toConventionDto(base)).toEqual({
      id: 'c1',
      category: 'naming',
      rule: 'Use camelCase',
      evidence_path: 'src/a.ts',
      evidence_snippet: 'const fooBar = 1;',
      evidence_start_line: 5,
      evidence_end_line: 5,
      confidence: 0.9,
      accepted: false,
    });
  });

  it('falls back to category "other" and confidence 0 for null columns', () => {
    const dto = toConventionDto({ ...base, category: null, confidence: null });
    expect(dto.category).toBe('other');
    expect(dto.confidence).toBe(0);
  });
});
