/**
 * SPEC-02 T3 — docs-walk.ts unit tests.
 *
 * No DB, no git. Builds a temp dir on disk, runs `walkContextDocs`, asserts
 * AC-1: markdown files under specs/docs/insights at any depth, excludes
 * non-.md and EXCLUDED_DIRS, nearest-ancestor badge, default repo-wide vs an
 * explicit `roots` override.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkContextDocs } from '../src/modules/repo-intel/pipeline/docs-walk.js';

async function writeFileAt(root: string, rel: string, contents: string): Promise<void> {
  const full = join(root, rel);
  const dir = full.slice(0, full.lastIndexOf('/'));
  if (dir && dir !== root) await mkdir(dir, { recursive: true });
  await writeFile(full, contents);
}

describe('walkContextDocs', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'repo-intel-docs-walk-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('matches .md files under specs/docs/insights at any depth (default repo-wide)', async () => {
    await writeFileAt(root, 'specs/SPEC-01.md', '# spec');
    await writeFileAt(root, 'docs/guide.md', '# guide');
    await writeFileAt(root, 'insights/notes.md', '# notes');
    await writeFileAt(root, 'packages/app/docs/nested/deep.md', '# deep, nested docs');

    const result = await walkContextDocs(root);

    expect(result.map((d) => d.path).sort()).toEqual([
      'docs/guide.md',
      'insights/notes.md',
      'packages/app/docs/nested/deep.md',
      'specs/SPEC-01.md',
    ]);
  });

  it('excludes non-.md files and EXCLUDED_DIRS (e.g. node_modules)', async () => {
    await writeFileAt(root, 'docs/readme.md', '# ok');
    await writeFileAt(root, 'docs/diagram.png', 'not-a-real-png');
    await writeFileAt(root, 'docs/notes.txt', 'plain text');
    await writeFileAt(root, 'node_modules/some-pkg/docs/readme.md', '# should be excluded');

    const result = await walkContextDocs(root);

    expect(result.map((d) => d.path)).toEqual(['docs/readme.md']);
  });

  it('excludes .md files with no specs/docs/insights ancestor', async () => {
    await writeFileAt(root, 'README.md', '# top-level, no doc root ancestor');
    await writeFileAt(root, 'src/CONTRIBUTING.md', '# not under a doc root either');
    await writeFileAt(root, 'docs/guide.md', '# this one counts');

    const result = await walkContextDocs(root);

    expect(result.map((d) => d.path)).toEqual(['docs/guide.md']);
  });

  it('badges by the NEAREST matching ancestor directory', async () => {
    // docs/specs/x.md -> nearest ancestor is 'specs' (immediate parent), not
    // 'docs' (grandparent).
    await writeFileAt(root, 'docs/specs/x.md', '# nested doc root');
    await writeFileAt(root, 'docs/guide.md', '# plain docs badge');
    await writeFileAt(root, 'insights/deep/dir/note.md', '# plain insights badge');

    const result = await walkContextDocs(root);
    const byPath = new Map(result.map((d) => [d.path, d.badge]));

    expect(byPath.get('docs/specs/x.md')).toBe('specs');
    expect(byPath.get('docs/guide.md')).toBe('docs');
    expect(byPath.get('insights/deep/dir/note.md')).toBe('insights');
  });

  it('scopes the walk to an explicit `roots` override instead of the whole clone', async () => {
    await writeFileAt(root, 'packages/a/docs/a.md', '# package a doc');
    await writeFileAt(root, 'packages/b/docs/b.md', '# package b doc');

    const scoped = await walkContextDocs(root, ['packages/a']);
    expect(scoped.map((d) => d.path)).toEqual(['packages/a/docs/a.md']);

    const wholeClone = await walkContextDocs(root);
    expect(wholeClone.map((d) => d.path).sort()).toEqual([
      'packages/a/docs/a.md',
      'packages/b/docs/b.md',
    ]);
  });
});
