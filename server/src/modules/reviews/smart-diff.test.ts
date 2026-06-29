import { describe, it, expect } from 'vitest';
import { classifyFile, composeSmartDiff, summarizeFile } from './smart-diff.js';
import { SPLIT_TOO_BIG_LINES } from './smart-diff-constants.js';
import type { Intent } from '@devdigest/shared';

// ---------------------------------------------------------------------------
// classifyFile
// ---------------------------------------------------------------------------

describe('classifyFile — boilerplate', () => {
  it.each([
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    'Cargo.lock',
    'poetry.lock',
    'composer.lock',
    'Gemfile.lock',
    'some-other.lock',
  ])('"%s" → boilerplate', (path) => {
    expect(classifyFile(path)).toBe('boilerplate');
  });

  it.each([
    'dist/index.js',
    'dist/x.js',
    'build/app.js',
    'out/bundle.js',
    '.next/server/pages/index.js',
    'coverage/lcov.info',
    'node_modules/lodash/index.js',
    '__snapshots__/a.snap',
    'src/__snapshots__/component.snap',
    'bundle.min.js',
    'styles.min.css',
    'source.map',
    'app.js.map',
    'src/db/migrations/0007_rate_limits.sql',
    'migrations/0001_init.sql',
  ])('"%s" → boilerplate', (path) => {
    expect(classifyFile(path)).toBe('boilerplate');
  });
});

describe('classifyFile — wiring', () => {
  it.each([
    'src/index.ts',
    'index.tsx',
    'lib/index.js',
    'src/server.ts',
    'src/main.ts',
    'src/app.ts',
  ])('"%s" → wiring', (path) => {
    expect(classifyFile(path)).toBe('wiring');
  });
});

describe('classifyFile — config', () => {
  it.each([
    'config.ts',
    'src/config.ts',
    'vite.config.ts',
    'jest.config.js',
    'app.config.ts',
    'tsconfig.json',
    'tsconfig.base.json',
    '.eslintrc',
    '.eslintrc.js',
    '.babelrc',
    'docker-compose.yml',
    'ci.yaml',
    '.env',
    '.env.production',
    '.env.local',
    '.github/workflows/ci.yml',
  ])('"%s" → config', (path) => {
    expect(classifyFile(path)).toBe('config');
  });
});

describe('classifyFile — core (default)', () => {
  it.each([
    'src/middleware/ratelimit.ts',
    'src/api/users.ts',
    'src/services/payments.ts',
    'src/utils/hash.ts',
    'src/models/user.ts',
    'lib/auth/jwt.ts',
  ])('"%s" → core', (path) => {
    expect(classifyFile(path)).toBe('core');
  });
});

describe('classifyFile — test/spec files → test', () => {
  it.each([
    'foo.test.ts',
    'bar.spec.tsx',
    '__tests__/x.ts',
    'test/ratelimit.test.ts',
    'src/__tests__/auth.test.ts',
    'src/api/users.spec.ts',
    'lib/utils.test.js',
  ])('"%s" → test', (path) => {
    expect(classifyFile(path)).toBe('test');
  });

  it('src/api/users.ts stays core (not a test file)', () => {
    expect(classifyFile('src/api/users.ts')).toBe('core');
  });
});

describe('classifyFile — Windows backslash paths normalised', () => {
  it('src\\api\\users.ts → core', () => {
    expect(classifyFile('src\\api\\users.ts')).toBe('core');
  });
  it('dist\\bundle.js → boilerplate', () => {
    expect(classifyFile('dist\\bundle.js')).toBe('boilerplate');
  });
  it('src\\index.ts → wiring', () => {
    expect(classifyFile('src\\index.ts')).toBe('wiring');
  });
});

// ---------------------------------------------------------------------------
// summarizeFile
// ---------------------------------------------------------------------------

const SAMPLE_INTENT: Intent = {
  intent: 'Add rate limiting to public API endpoints',
  in_scope: [
    'webhook forwarding and callback handling',
    'rate limiting middleware implementation',
    'user list endpoint performance',
    'configuration and secrets management',
  ],
  out_of_scope: ['database migrations', 'authentication'],
};

describe('summarizeFile — matching', () => {
  it('picks the best-matching in_scope entry for a webhook file', () => {
    const result = summarizeFile('src/api/public/webhooks.ts', SAMPLE_INTENT);
    expect(result).toBe('webhook forwarding and callback handling');
  });

  it('picks the rate-limiting entry for the middleware file', () => {
    const result = summarizeFile('src/middleware/ratelimit.ts', SAMPLE_INTENT);
    expect(result).toBe('rate limiting middleware implementation');
  });

  it('picks the config entry for src/config.ts', () => {
    const result = summarizeFile('src/config.ts', SAMPLE_INTENT);
    expect(result).toBe('configuration and secrets management');
  });
});

describe('summarizeFile — no match / null intent', () => {
  it('returns null when intent is null', () => {
    expect(summarizeFile('src/api/webhooks.ts', null)).toBeNull();
  });

  it('returns null when intent is undefined', () => {
    expect(summarizeFile('src/api/webhooks.ts', undefined)).toBeNull();
  });

  it('returns null when in_scope is empty', () => {
    const emptyIntent: Intent = { intent: 'x', in_scope: [], out_of_scope: [] };
    expect(summarizeFile('src/api/webhooks.ts', emptyIntent)).toBeNull();
  });

  it('returns null when no token overlap exists', () => {
    const result = summarizeFile('src/completely/unrelated/module.ts', SAMPLE_INTENT);
    expect(result).toBeNull();
  });
});

describe('composeSmartDiff — pseudocode_summary from intent', () => {
  it('fills pseudocode_summary from the best-matching in_scope entry', () => {
    const files = [
      { path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
    ];
    const result = composeSmartDiff(files, [], SAMPLE_INTENT);
    const file = result.groups[0]!.files[0]!;
    expect(file.pseudocode_summary).toBe('webhook forwarding and callback handling');
  });

  it('leaves pseudocode_summary null when intent is null', () => {
    const files = [
      { path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
    ];
    const result = composeSmartDiff(files, [], null);
    const file = result.groups[0]!.files[0]!;
    expect(file.pseudocode_summary).toBeNull();
  });

  it('leaves pseudocode_summary null when called without the intent arg (2-arg compat)', () => {
    const files = [
      { path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
    ];
    const result = composeSmartDiff(files, []);
    const file = result.groups[0]!.files[0]!;
    expect(file.pseudocode_summary).toBeNull();
  });

  it('returns null summary for a file with no token overlap to any in_scope', () => {
    const files = [
      { path: 'src/completely/unrelated/xyz.ts', additions: 5, deletions: 0 },
    ];
    const result = composeSmartDiff(files, [], SAMPLE_INTENT);
    const file = result.groups[0]!.files[0]!;
    expect(file.pseudocode_summary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// composeSmartDiff
// ---------------------------------------------------------------------------

describe('composeSmartDiff — group order', () => {
  it('emits core → wiring → boilerplate (empty groups omitted)', () => {
    const files = [
      { path: 'src/index.ts', additions: 5, deletions: 0 },      // wiring
      { path: 'src/api/users.ts', additions: 10, deletions: 2 },  // core
      { path: 'package-lock.json', additions: 50, deletions: 10 }, // boilerplate
    ];
    const result = composeSmartDiff(files, []);
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
  });

  it('omits the boilerplate group when no boilerplate files present', () => {
    const files = [
      { path: 'src/index.ts', additions: 5, deletions: 0 },
      { path: 'src/api/users.ts', additions: 10, deletions: 2 },
    ];
    const result = composeSmartDiff(files, []);
    const roles = result.groups.map((g) => g.role);
    expect(roles).not.toContain('boilerplate');
    expect(roles).toContain('core');
    expect(roles).toContain('wiring');
  });
});

describe('composeSmartDiff — finding_lines mapping', () => {
  it('maps findings to the correct file and produces sorted-unique lines', () => {
    const files = [
      { path: 'src/config.ts', additions: 4, deletions: 0 },
      { path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ];
    const findings = [
      { file: 'src/config.ts', start_line: 12 },
      { file: 'src/api/users.ts', start_line: 45 },
      { file: 'src/api/users.ts', start_line: 45 }, // duplicate — deduped
      { file: 'src/api/users.ts', start_line: 30 },
    ];
    const result = composeSmartDiff(files, findings);
    // config.ts is config; users.ts is core — findings map across groups.
    const configGroup = result.groups.find((g) => g.role === 'config');
    const coreGroup = result.groups.find((g) => g.role === 'core');
    expect(configGroup).toBeDefined();
    expect(coreGroup).toBeDefined();
    const configFile = configGroup!.files.find((f) => f.path === 'src/config.ts');
    const usersFile = coreGroup!.files.find((f) => f.path === 'src/api/users.ts');
    expect(configFile!.finding_lines).toEqual([12]);
    expect(usersFile!.finding_lines).toEqual([30, 45]); // sorted
  });

  it('file with no findings gets an empty finding_lines array', () => {
    const files = [{ path: 'src/utils/hash.ts', additions: 3, deletions: 0 }];
    const result = composeSmartDiff(files, []);
    const f = result.groups[0]!.files[0]!;
    expect(f.finding_lines).toEqual([]);
  });
});

describe('composeSmartDiff — lock file always in boilerplate', () => {
  it('package-lock.json ends up in the boilerplate group', () => {
    const files = [
      { path: 'package-lock.json', additions: 92, deletions: 24 },
      { path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ];
    const result = composeSmartDiff(files, []);
    const bpGroup = result.groups.find((g) => g.role === 'boilerplate');
    expect(bpGroup).toBeDefined();
    expect(bpGroup!.files.map((f) => f.path)).toContain('package-lock.json');
  });
});

describe('composeSmartDiff — intra-group ordering', () => {
  it('files with findings come before files without', () => {
    const files = [
      { path: 'src/a.ts', additions: 10, deletions: 0 },  // no finding
      { path: 'src/b.ts', additions: 5, deletions: 0 },   // has finding
    ];
    const findings = [{ file: 'src/b.ts', start_line: 3 }];
    const result = composeSmartDiff(files, findings);
    const coreFiles = result.groups.find((g) => g.role === 'core')!.files;
    expect(coreFiles[0]!.path).toBe('src/b.ts'); // has findings → first
    expect(coreFiles[1]!.path).toBe('src/a.ts');
  });

  it('among files without findings, larger change-size comes first', () => {
    const files = [
      { path: 'src/small.ts', additions: 2, deletions: 0 },
      { path: 'src/large.ts', additions: 50, deletions: 10 },
    ];
    const result = composeSmartDiff(files, []);
    const coreFiles = result.groups.find((g) => g.role === 'core')!.files;
    expect(coreFiles[0]!.path).toBe('src/large.ts');
  });

  it('tie-breaks by path asc', () => {
    const files = [
      { path: 'src/z.ts', additions: 5, deletions: 0 },
      { path: 'src/a.ts', additions: 5, deletions: 0 },
    ];
    const result = composeSmartDiff(files, []);
    const coreFiles = result.groups.find((g) => g.role === 'core')!.files;
    expect(coreFiles[0]!.path).toBe('src/a.ts');
  });
});

describe('composeSmartDiff — split_suggestion', () => {
  it('total_lines = sum of additions + deletions across ALL files', () => {
    const files = [
      { path: 'src/a.ts', additions: 10, deletions: 5 },
      { path: 'src/b.ts', additions: 20, deletions: 3 },
    ];
    const result = composeSmartDiff(files, []);
    expect(result.split_suggestion.total_lines).toBe(38);
  });

  it(`too_big is false when total_lines <= ${SPLIT_TOO_BIG_LINES}`, () => {
    const files = [{ path: 'src/a.ts', additions: SPLIT_TOO_BIG_LINES, deletions: 0 }];
    const result = composeSmartDiff(files, []);
    expect(result.split_suggestion.too_big).toBe(false);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });

  it(`too_big is true when total_lines > ${SPLIT_TOO_BIG_LINES}`, () => {
    const files = [{ path: 'src/a.ts', additions: SPLIT_TOO_BIG_LINES + 1, deletions: 0 }];
    const result = composeSmartDiff(files, []);
    expect(result.split_suggestion.too_big).toBe(true);
  });

  it('proposed_splits groups files by top-2 path segments', () => {
    const files = [
      { path: 'src/api/users.ts', additions: 200, deletions: 0 },
      { path: 'src/api/orders.ts', additions: 200, deletions: 0 },
      { path: 'src/db/schema.ts', additions: 200, deletions: 0 },
    ];
    const result = composeSmartDiff(files, []);
    expect(result.split_suggestion.too_big).toBe(true);
    const splits = result.split_suggestion.proposed_splits;
    const apiSplit = splits.find((s) => s.name === 'src/api');
    const dbSplit = splits.find((s) => s.name === 'src/db');
    expect(apiSplit).toBeDefined();
    expect(apiSplit!.files).toContain('src/api/users.ts');
    expect(apiSplit!.files).toContain('src/api/orders.ts');
    expect(dbSplit).toBeDefined();
    expect(dbSplit!.files).toContain('src/db/schema.ts');
  });

  it('proposed_splits is empty when not too_big', () => {
    const files = [{ path: 'src/a.ts', additions: 10, deletions: 0 }];
    const result = composeSmartDiff(files, []);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });
});
