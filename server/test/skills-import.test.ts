import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { parseSkillImport } from '../src/modules/skills/helpers.js';

/**
 * Unit coverage for skill import parsing. The security invariant: only the
 * markdown body is ever extracted — a `.zip`'s other entries are listed for the
 * preview but never decompressed, written, or executed.
 */
describe('parseSkillImport', () => {
  it('reads a markdown file as the skill body', () => {
    const r = parseSkillImport('my-skill.md', strToU8('# Rule\nDo the thing.'));
    expect(r.body).toBe('# Rule\nDo the thing.');
    expect(r.name).toBe('my-skill');
    expect(r.ignored_files).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('reads a .txt file as the body', () => {
    const r = parseSkillImport('notes.txt', strToU8('plain text body'));
    expect(r.body).toBe('plain text body');
    expect(r.name).toBe('notes');
  });

  it('extracts only the markdown body from a .zip and lists (never runs) other entries', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('# Skill\nbody here'),
      'run.sh': strToU8('#!/bin/sh\necho pwned'),
      'data.json': strToU8('{"a":1}'),
    });
    const r = parseSkillImport('pack.zip', zip);
    expect(r.body).toBe('# Skill\nbody here');
    expect(r.ignored_files).toContain('run.sh');
    expect(r.ignored_files).toContain('data.json');
    expect(r.ignored_files).not.toContain('SKILL.md');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('prefers SKILL.md over other markdown entries', () => {
    const zip = zipSync({
      'README.md': strToU8('readme'),
      'SKILL.md': strToU8('the skill'),
    });
    const r = parseSkillImport('pack.zip', zip);
    expect(r.body).toBe('the skill');
    expect(r.ignored_files).toContain('README.md');
  });

  it('throws when a .zip has no markdown body', () => {
    const zip = zipSync({ 'run.sh': strToU8('echo hi') });
    expect(() => parseSkillImport('pack.zip', zip)).toThrow();
  });

  it('rejects unsupported file types', () => {
    expect(() => parseSkillImport('evil.exe', strToU8('MZ...'))).toThrow();
  });

  it('rejects an empty markdown file', () => {
    expect(() => parseSkillImport('empty.md', strToU8('   '))).toThrow();
  });
});
