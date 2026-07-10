# dev-digest-structure

House conventions for `dev-digest`. Flag changes that violate any rule below and cite the offending `file:line`.

## export-only-the-necessary-symbols-from-modules-using-explicit-export-lists
Export only the necessary symbols from modules, using explicit export lists.

Detected in `server/src/platform/structured.ts:6-12`:
```
export {
  toJsonSchema,
  extractJson,
  parseWithRepair,
  type JsonSchema,
  type ParseResult,
} from '@devdigest/reviewer-core';
```

## use-named-exports-for-all-module-level-functions-classes-and-constants-avoid-default-exports
Use named exports for all module-level functions, classes, and constants; avoid default exports.

Detected in `server/src/platform/prompts.ts:24`:
```
export async function loadPromptTemplate(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const raw = await readFile(join(PROMPTS_DIR, name), 'utf8');
  cache.set(name, raw);
  return raw;
}

/** Replace `{{key}}` with vars[key]; unknown placeholders are left intact. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
```

## when-re-exporting-from-another-module-use-a-single-export-statement-listing-all-re-exported-symbols
When re-exporting from another module, use a single export statement listing all re-exported symbols.

Detected in `server/src/platform/grounding.ts:6`:
```
export { groundFindings, groundingSummary, type GroundingResult } from '@devdigest/reviewer-core';
```
