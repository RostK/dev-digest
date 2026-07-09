# dev-digest-style

House conventions for `dev-digest`. Flag changes that violate any rule below and cite the offending `file:line`.

## use-default-parameter-values-for-configuration-options-in-constructors-and-functions
Use default parameter values for configuration options in constructors and functions.

Detected in `server/src/platform/jobs.ts:36-43`:
```
constructor(
    private db: Db,
    opts: JobRunnerOptions = {},
  ) {
    this.queue = new PQueue({ concurrency: opts.concurrency ?? 3 });
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    this.retries = opts.retries ?? 2;
  }
```

## use-private-class-fields-for-encapsulation-and-to-prevent-external-mutation
Use private class fields for encapsulation and to prevent external mutation.

Detected in `server/src/platform/price-book.ts:21-24`:
```
export class PriceBook {
  private prices = new Map<string, { in: number; out: number }>();
  private expires = 0;
  private refreshing = false;
```

## use-map-and-set-for-keyed-collections-and-membership-checks-instead-of-plain-objects-or-arrays
Use Map and Set for keyed collections and membership checks instead of plain objects or arrays.

Detected in `server/src/platform/sse.ts:20-24`:
```
private emitters = new Map<string, EventEmitter>();
  private buffers = new Map<string, RunEvent[]>();
  private seq = new Map<string, number>();
  private completed = new Set<string>();
  private cancelled = new Set<string>();
```

## document-public-classes-functions-and-modules-with-jsdoc-style-comments-explaining-their-purpose-and-usage
Document public classes, functions, and modules with JSDoc-style comments explaining their purpose and usage.

Detected in `server/src/platform/run-logger.ts:4-9`:
```
/**
 * Structured run logger — the SINGLE sink for everything a run does.
 *
 * Every operation in a review run (load diff, derive intent, embed + retrieve
 * memory, load skills/specs, each model call, grounding, persistence) goes
 * through here so it is, in one shot:
```

## use-nullish-coalescing-and-optional-chaining-for-safe-property-access-and-defaulting
Use nullish coalescing (??) and optional chaining (?.) for safe property access and defaulting.

Detected in `server/src/platform/trace-builder.ts:39-46`:
```
config: {
      agent: input.config.agent,
      version: input.config.version ?? null,
      provider: input.config.provider ?? null,
      model: input.config.model,
      pr: input.config.pr ?? null,
      source: input.config.source ?? 'local',
    },
```
