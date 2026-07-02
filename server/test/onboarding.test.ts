import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { Onboarding } from '@devdigest/shared';
import type { Container } from '../src/platform/container.js';
import type { IndexState } from '../src/modules/repo-intel/types.js';
import {
  buildDeterministicSkeleton,
  buildMessages,
  collectFacts,
  fillUsedBy,
  generateOnboarding,
  normalizeToCanonicalFive,
  shouldPersistGeneration,
  type OnboardingFacts,
} from '../src/modules/onboarding/facts.js';
import {
  isStale,
  toJobStatus,
  toOnboardingResponse,
} from '../src/modules/onboarding/helpers.js';
import { OnboardingService, type OnboardingJobPayload } from '../src/modules/onboarding/service.js';
import type { JobRow, OnboardingRow } from '../src/modules/onboarding/repository.js';
import {
  ONBOARDING_JOB_KIND,
  ONBOARDING_MAX_KEY_FILES,
  ONBOARDING_MAX_LINKS_PER_SECTION,
  ONBOARDING_TOP_FILES_COUNT,
  SETUP_FACT_FILENAMES,
} from '../src/modules/onboarding/constants.js';
import * as t from '../src/db/schema.js';

const CANONICAL_ORDER = ['architecture', 'critical_paths', 'how_to_run', 'reading_path', 'first_tasks'];

const EMPTY_FACTS: OnboardingFacts = {
  repoMap: '',
  keyFiles: [],
  criticalPaths: [],
  setupFacts: [],
  filesIndexed: 0,
};

function indexState(overrides: Partial<IndexState> = {}): IndexState {
  return {
    repoId: 'r1',
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'sha',
    indexerVersion: 2,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ===========================================================================
// facts.ts — deterministic assembly
// ===========================================================================

describe('collectFacts', () => {
  it('calls the named repo-intel facade methods and bounds the clone reads (AC-7, AC-8)', async () => {
    const manyFiles = Array.from({ length: 20 }, (_, i) => `src/file${i}.ts`);
    const readFileCalls: string[] = [];
    const container = {
      repoIntel: {
        getRepoMap: vi.fn().mockResolvedValue({ text: 'skeleton', tokens: 10, cached: true }),
        getTopFilesByRank: vi.fn().mockResolvedValue(manyFiles),
        getFileRank: vi.fn().mockResolvedValue(manyFiles.map((path, i) => ({ path, percentile: 100 - i }))),
        getCriticalPaths: vi.fn().mockResolvedValue([['src/a.ts', 'src/b.ts']]),
        getIndexState: vi.fn().mockResolvedValue(indexState({ filesIndexed: 42 })),
      },
      git: {
        readFile: vi.fn(async (_ref: unknown, path: string) => {
          readFileCalls.push(path);
          return `content of ${path}`;
        }),
      },
    } as unknown as Container;

    const facts = await collectFacts(container, {
      id: 'r1',
      owner: 'acme',
      name: 'demo',
      clonePath: '/clones/acme/demo',
    });

    expect(container.repoIntel.getRepoMap).toHaveBeenCalledWith('r1');
    expect(container.repoIntel.getTopFilesByRank).toHaveBeenCalledWith('r1', ONBOARDING_TOP_FILES_COUNT);
    expect(container.repoIntel.getFileRank).toHaveBeenCalled();
    expect(container.repoIntel.getCriticalPaths).toHaveBeenCalledWith('r1');
    expect(container.repoIntel.getIndexState).toHaveBeenCalledWith('r1');

    // AC-8: bounded input, never the full 20-file rank list, never a full-tree read.
    expect(facts.keyFiles.length).toBeLessThanOrEqual(ONBOARDING_MAX_KEY_FILES);
    expect(readFileCalls.length).toBe(ONBOARDING_MAX_KEY_FILES + SETUP_FACT_FILENAMES.length);
    expect(facts.filesIndexed).toBe(42);
    expect(facts.criticalPaths).toEqual([['src/a.ts', 'src/b.ts']]);
  });

  it('never reads the clone when the repo has no clonePath', async () => {
    const readFile = vi.fn();
    const container = {
      repoIntel: {
        getRepoMap: vi.fn().mockResolvedValue({ text: '', tokens: 0, cached: false }),
        getTopFilesByRank: vi.fn().mockResolvedValue(['a.ts']),
        getFileRank: vi.fn().mockResolvedValue([]),
        getCriticalPaths: vi.fn().mockResolvedValue([]),
        getIndexState: vi.fn().mockResolvedValue(indexState({ filesIndexed: 0 })),
      },
      git: { readFile },
    } as unknown as Container;

    const facts = await collectFacts(container, { id: 'r1', owner: 'acme', name: 'demo', clonePath: null });
    expect(readFile).not.toHaveBeenCalled();
    expect(facts.keyFiles).toEqual([]);
    expect(facts.setupFacts).toEqual([]);
  });
});

describe('buildMessages', () => {
  it('wraps every repo-derived block as untrusted and renders the canonical section spec (AC-16, AC-14)', async () => {
    const facts: OnboardingFacts = {
      repoMap: 'graph TD; A-->B',
      keyFiles: [{ path: 'src/a.ts', content: 'export const a = 1;', rank: 90 }],
      criticalPaths: [['src/a.ts', 'src/b.ts']],
      setupFacts: [{ path: 'package.json', content: '{}' }],
      filesIndexed: 12,
    };

    const [system, user] = await buildMessages(facts);
    expect(system!.role).toBe('system');
    for (const kind of CANONICAL_ORDER) expect(system!.content).toContain(kind);
    expect(system!.content).toContain('English');

    expect(user!.role).toBe('user');
    expect(user!.content).toContain('<untrusted source="repo-map">');
    expect(user!.content).toContain('<untrusted source="critical-paths">');
    expect(user!.content).toContain('<untrusted source="key-files">');
    expect(user!.content).toContain('<untrusted source="setup-facts">');
    // AC-14: the reading-path order is exactly getCriticalPaths' order.
    expect(user!.content).toContain('1. src/a.ts → src/b.ts');
  });

  it('omits the key-files / setup-facts blocks entirely when there is nothing to show', async () => {
    const [, user] = await buildMessages(EMPTY_FACTS);
    expect(user!.content).not.toContain('source="key-files"');
    expect(user!.content).not.toContain('source="setup-facts"');
  });
});

describe('fillUsedBy', () => {
  it('fills used_by on critical_paths links from getBlastRadius; other sections are untouched (AC-12)', async () => {
    const getBlastRadius = vi.fn(async (_repoId: string, files: string[]) => {
      if (files[0] === 'src/hot.ts') {
        return { changedSymbols: [], callers: [], impactedEndpoints: ['GET /a', 'POST /a', 'GET /b'] };
      }
      return { changedSymbols: [], callers: [], impactedEndpoints: [] };
    });
    const container = { repoIntel: { getBlastRadius } } as unknown as Container;

    const onboarding: Onboarding = {
      sections: [
        {
          kind: 'architecture',
          title: 'Architecture',
          body: 'x',
          diagram: null,
          links: [{ label: 'x', path: 'src/x.ts' }],
        },
        {
          kind: 'critical_paths',
          title: 'Critical paths',
          body: 'y',
          diagram: null,
          links: [
            { label: 'hot', path: 'src/hot.ts', rationale: 'core logic' },
            { label: 'cold', path: 'src/cold.ts', rationale: 'rarely touched' },
          ],
        },
      ],
    };

    const out = await fillUsedBy(container, 'r1', onboarding);
    const cp = out.sections.find((s) => s.kind === 'critical_paths')!;
    expect(cp.links[0]!.used_by).toBe(3); // 3 distinct impacted endpoints (GET /a, POST /a, GET /b) — method+path, per "used by N routes"
    expect(cp.links[1]!.used_by).toBe(0);
    expect(cp.links[0]!.rationale).toBe('core logic'); // model-authored field untouched

    const arch = out.sections.find((s) => s.kind === 'architecture')!;
    expect(arch.links[0]!.used_by).toBeUndefined(); // never touches non-critical_paths sections
    expect(getBlastRadius).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when there is no critical_paths section', async () => {
    const getBlastRadius = vi.fn();
    const container = { repoIntel: { getBlastRadius } } as unknown as Container;
    const onboarding: Onboarding = {
      sections: [{ kind: 'architecture', title: 'A', body: 'x', diagram: null, links: [] }],
    };
    const out = await fillUsedBy(container, 'r1', onboarding);
    expect(out).toEqual(onboarding);
    expect(getBlastRadius).not.toHaveBeenCalled();
  });
});

describe('normalizeToCanonicalFive', () => {
  it('reorders, fills missing sections, strips non-architecture diagrams, and caps links (AC-3)', () => {
    const scrambled: Onboarding = {
      sections: [
        { kind: 'first_tasks', title: 'Tasks', body: 'do X', diagram: null, links: [] },
        {
          kind: 'critical_paths',
          title: 'CP',
          body: 'y',
          diagram: 'flowchart TD; A-->B', // model wrongly added a diagram here
          links: Array.from({ length: 10 }, (_, i) => ({ label: `f${i}`, path: `f${i}.ts` })),
        },
        { kind: 'architecture', title: 'Arch', body: 'z', diagram: 'flowchart TD; X-->Y', links: [] },
        // how_to_run + reading_path OMITTED by the model
      ],
    };

    const out = normalizeToCanonicalFive(scrambled);
    expect(out.sections.map((s) => s.kind)).toEqual(CANONICAL_ORDER);
    expect(out.sections[0]!.diagram).toBe('flowchart TD; X-->Y'); // architecture keeps its diagram
    expect(out.sections[1]!.diagram).toBeNull(); // stripped from critical_paths
    expect(out.sections[1]!.links).toHaveLength(ONBOARDING_MAX_LINKS_PER_SECTION); // capped
    expect(out.sections[2]!.title).toBe('How to run locally'); // filled-in default title
    expect(out.sections[2]!.body).toBe('');
    // AC-15: first_tasks content is preserved verbatim from the single completion — no extra fetch.
    expect(out.sections[4]!.body).toBe('do X');
  });

  it('is idempotent on an already-canonical tour', () => {
    const skeleton = buildDeterministicSkeleton(EMPTY_FACTS);
    expect(normalizeToCanonicalFive(skeleton)).toEqual(skeleton);
  });
});

describe('buildDeterministicSkeleton', () => {
  it('produces a valid, grounded Onboarding — reading order from criticalPaths, steps from setupFacts (AC-13, AC-14, AC-18)', () => {
    const facts: OnboardingFacts = {
      repoMap: 'graph',
      keyFiles: [],
      criticalPaths: [['src/entry.ts', 'src/core.ts', 'src/util.ts']],
      setupFacts: [
        { path: 'package.json', content: '{}' },
        { path: 'README.md', content: '# demo' },
      ],
      filesIndexed: 7,
    };

    const skeleton = buildDeterministicSkeleton(facts);
    expect(() => Onboarding.parse(skeleton)).not.toThrow();
    expect(skeleton.sections.map((s) => s.kind)).toEqual(CANONICAL_ORDER);

    const readingPath = skeleton.sections.find((s) => s.kind === 'reading_path')!;
    expect(readingPath.links.map((l) => l.path)).toEqual(['src/entry.ts', 'src/core.ts', 'src/util.ts']);

    const howToRun = skeleton.sections.find((s) => s.kind === 'how_to_run')!;
    expect(howToRun.links.map((l) => l.path)).toEqual(['package.json', 'README.md']);
    expect(howToRun.body).toContain('package.json');

    // never invents a path that wasn't in the provided facts (AC-16 spirit)
    const allPaths = skeleton.sections.flatMap((s) => s.links.map((l) => l.path));
    for (const p of allPaths) {
      expect([...facts.criticalPaths.flat(), ...facts.setupFacts.map((f) => f.path)]).toContain(p);
    }
  });
});

// ===========================================================================
// generateOnboarding — AC-6 (one completeStructured call) + AC-18 (fallback)
// ===========================================================================

function fakeSettingsDb(): Container['db'] {
  // getFeatureModelOverride reads `settings` — no workspace override configured,
  // so resolveFeatureModel falls through to the registry default (openrouter).
  return {
    select: () => ({ from: () => ({ where: async () => [] }) }),
  } as unknown as Container['db'];
}

describe('generateOnboarding', () => {
  it('makes exactly ONE completeStructured call against the Onboarding schema via resolveFeatureModel (AC-6)', async () => {
    const valid = buildDeterministicSkeleton(EMPTY_FACTS);
    const completeStructured = vi.fn().mockResolvedValue({
      data: valid,
      model: 'deepseek/deepseek-v4-flash',
      tokensIn: 1,
      tokensOut: 1,
      costUsd: null,
      raw: '',
      attempts: 1,
    });
    const container = {
      db: fakeSettingsDb(),
      llm: vi.fn().mockResolvedValue({ completeStructured }),
    } as unknown as Container;

    const { onboarding, usedFallback } = await generateOnboarding(container, 'ws1', EMPTY_FACTS);

    expect(completeStructured).toHaveBeenCalledTimes(1);
    const req = completeStructured.mock.calls[0]![0] as { schema: unknown; schemaName: string; model: string };
    expect(req.schema).toBe(Onboarding);
    expect(req.schemaName).toBe('Onboarding');
    expect(req.model).toBe('deepseek/deepseek-v4-flash'); // the registry default for 'onboarding'
    expect(container.llm).toHaveBeenCalledWith('openrouter');
    expect(usedFallback).toBe(false);
    expect(onboarding).toEqual(valid);
  });

  it('falls back to the deterministic skeleton when the model throws (AC-18)', async () => {
    const completeStructured = vi.fn().mockRejectedValue(new Error('no key'));
    const container = {
      db: fakeSettingsDb(),
      llm: vi.fn().mockResolvedValue({ completeStructured }),
    } as unknown as Container;

    const { onboarding, usedFallback } = await generateOnboarding(container, 'ws1', EMPTY_FACTS);
    expect(usedFallback).toBe(true);
    expect(onboarding).toEqual(buildDeterministicSkeleton(EMPTY_FACTS));
  });

  it('falls back when the completion has no sections', async () => {
    const completeStructured = vi.fn().mockResolvedValue({
      data: { sections: [] },
      model: 'x',
      tokensIn: 1,
      tokensOut: 1,
      costUsd: null,
      raw: '',
      attempts: 1,
    });
    const container = {
      db: fakeSettingsDb(),
      llm: vi.fn().mockResolvedValue({ completeStructured }),
    } as unknown as Container;

    const { usedFallback } = await generateOnboarding(container, 'ws1', EMPTY_FACTS);
    expect(usedFallback).toBe(true);
  });

  it('falls back when resolving the LLM provider throws (missing key)', async () => {
    const container = {
      db: fakeSettingsDb(),
      llm: vi.fn().mockRejectedValue(new Error('OPENROUTER_API_KEY is not configured')),
    } as unknown as Container;

    const { usedFallback } = await generateOnboarding(container, 'ws1', EMPTY_FACTS);
    expect(usedFallback).toBe(true);
  });
});

describe('shouldPersistGeneration (AC-18)', () => {
  it('always persists a real (non-fallback) generation', () => {
    expect(shouldPersistGeneration(false, true)).toBe(true);
    expect(shouldPersistGeneration(false, false)).toBe(true);
  });

  it('persists the fallback skeleton only when there is no existing tour yet', () => {
    expect(shouldPersistGeneration(true, false)).toBe(true);
    expect(shouldPersistGeneration(true, true)).toBe(false); // never overwrite a good tour
  });
});

// ===========================================================================
// helpers.ts — pure mapping
// ===========================================================================

describe('isStale', () => {
  it('is false with no tour yet', () => {
    expect(isStale(indexState({ updatedAt: new Date('2026-02-01') }), null)).toBe(false);
  });

  it('is true only once the index moved on past generated_at', () => {
    const generatedAt = new Date('2026-01-01T00:00:00Z');
    expect(isStale(indexState({ updatedAt: new Date('2026-01-01T00:00:00Z') }), generatedAt)).toBe(false);
    expect(isStale(indexState({ updatedAt: new Date('2026-01-02T00:00:00Z') }), generatedAt)).toBe(true);
  });
});

describe('toOnboardingResponse', () => {
  it('never 404s on a missing tour — returns tour:null with freshness/job still populated', () => {
    const jobRow: JobRow = {
      id: 'job-1',
      workspaceId: 'ws1',
      kind: ONBOARDING_JOB_KIND,
      payload: { repoId: 'r1' } satisfies OnboardingJobPayload,
      status: 'running',
      attempts: 0,
      scheduledAt: new Date(),
      startedAt: new Date(),
      finishedAt: null,
      error: null,
    };
    const res = toOnboardingResponse(undefined, indexState({ filesIndexed: 5 }), jobRow);
    expect(res.tour).toBeNull();
    expect(res.generated_at).toBeNull();
    expect(res.files_indexed).toBe(5);
    expect(res.indexed).toBe(true);
    expect(res.job).toEqual(toJobStatus(jobRow));
  });

  it('maps a persisted row to its tour + generated_at', () => {
    const skeleton = buildDeterministicSkeleton(EMPTY_FACTS);
    const generatedAt = new Date('2026-01-01T00:00:00Z');
    const row: OnboardingRow = { repoId: 'r1', json: skeleton, generatedAt };
    const res = toOnboardingResponse(row, indexState({ updatedAt: generatedAt }), undefined);
    expect(res.tour).toEqual(skeleton);
    expect(res.generated_at).toBe(generatedAt.toISOString());
    expect(res.stale).toBe(false);
    expect(res.job).toBeNull();
  });
});

// ===========================================================================
// service.ts — maybeEnqueueRegen (AC-24)
// ===========================================================================

function fakeQueryDb(rows: { onboarding?: OnboardingRow[]; jobs?: JobRow[] }): Container['db'] {
  const db = {
    select: () => ({
      from: (table: unknown) => {
        const result = table === t.onboarding ? (rows.onboarding ?? []) : (rows.jobs ?? []);
        const builder = {
          where: () => builder,
          orderBy: () => builder,
          limit: () => builder,
          then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject),
        };
        return builder;
      },
    }),
  };
  return db as unknown as Container['db'];
}

function tourRow(generatedAt: Date): OnboardingRow {
  return { repoId: 'r1', json: buildDeterministicSkeleton(EMPTY_FACTS), generatedAt };
}

describe('OnboardingService.maybeEnqueueRegen (AC-24)', () => {
  it('no-ops when no tour exists yet — never auto-generates', async () => {
    const enqueue = vi.fn();
    const container = {
      db: fakeQueryDb({ onboarding: [] }),
      repoIntel: { getIndexState: vi.fn().mockResolvedValue(indexState()) },
      jobs: { enqueue },
    } as unknown as Container;

    await new OnboardingService(container).maybeEnqueueRegen('ws1', 'r1');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('enqueues exactly one regen when a tour exists AND the index advanced past generated_at', async () => {
    const generatedAt = new Date('2026-01-01T00:00:00Z');
    const enqueue = vi.fn().mockResolvedValue({ id: 'job-2', done: Promise.resolve() });
    const container = {
      db: fakeQueryDb({ onboarding: [tourRow(generatedAt)], jobs: [] }),
      repoIntel: {
        getIndexState: vi.fn().mockResolvedValue(indexState({ updatedAt: new Date('2026-01-02T00:00:00Z') })),
      },
      jobs: { enqueue },
    } as unknown as Container;

    await new OnboardingService(container).maybeEnqueueRegen('ws1', 'r1');
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('ws1', ONBOARDING_JOB_KIND, { repoId: 'r1' });
  });

  it('no-ops when the index has NOT advanced past generated_at', async () => {
    const generatedAt = new Date('2026-01-02T00:00:00Z');
    const enqueue = vi.fn();
    const container = {
      db: fakeQueryDb({ onboarding: [tourRow(generatedAt)], jobs: [] }),
      repoIntel: {
        getIndexState: vi.fn().mockResolvedValue(indexState({ updatedAt: new Date('2026-01-01T00:00:00Z') })),
      },
      jobs: { enqueue },
    } as unknown as Container;

    await new OnboardingService(container).maybeEnqueueRegen('ws1', 'r1');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('de-dupes: no-ops when a regen is already queued/running for the repo', async () => {
    const generatedAt = new Date('2026-01-01T00:00:00Z');
    const inFlight: JobRow = {
      id: 'job-inflight',
      workspaceId: 'ws1',
      kind: ONBOARDING_JOB_KIND,
      payload: { repoId: 'r1' },
      status: 'queued',
      attempts: 0,
      scheduledAt: new Date(),
      startedAt: null,
      finishedAt: null,
      error: null,
    };
    const enqueue = vi.fn();
    const container = {
      db: fakeQueryDb({ onboarding: [tourRow(generatedAt)], jobs: [inFlight] }),
      repoIntel: {
        getIndexState: vi.fn().mockResolvedValue(indexState({ updatedAt: new Date('2026-01-03T00:00:00Z') })),
      },
      jobs: { enqueue },
    } as unknown as Container;

    await new OnboardingService(container).maybeEnqueueRegen('ws1', 'r1');
    expect(enqueue).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// routes.ts — AC-21 (no public/unauthenticated share endpoint)
// ===========================================================================

describe('onboarding routes source (AC-21)', () => {
  it('defines exactly the three workspace-scoped routes and no public/share endpoint', () => {
    const routesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'modules', 'onboarding', 'routes.ts');
    const src = readFileSync(routesPath, 'utf8');
    const registrations = [...src.matchAll(/app\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map(
      (m) => `${m[1]!.toUpperCase()} ${m[2]}`,
    );
    expect(registrations.sort()).toEqual(
      [
        'GET /repos/:id/onboarding',
        'GET /repos/:id/onboarding/job/:jobId',
        'POST /repos/:id/onboarding/generate',
      ].sort(),
    );
    expect(src).not.toMatch(/\/share\b/i);
    // every route handler resolves tenancy via getContext — no bypass (at least
    // one getContext per registered route; extra scoping calls are fine).
    expect((src.match(/getContext\(/g) ?? []).length).toBeGreaterThanOrEqual(registrations.length);
  });
});
