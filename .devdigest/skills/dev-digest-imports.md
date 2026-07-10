# dev-digest-imports

House conventions for `dev-digest`. Flag changes that violate any rule below and cite the offending `file:line`.

## use-typescript-s-import-type-for-type-only-imports-to-avoid-including-types-in-the-emitted-javascript
Use TypeScript's 'import type' for type-only imports to avoid including types in the emitted JavaScript.

Detected in `server/src/platform/trace-builder.ts:1-8`:
```
import type {
  MemoryPulled,
  PromptAssembly,
  RunLogLine,
  RunStats,
  RunTrace,
  ToolCall,
} from '@devdigest/shared';
```
