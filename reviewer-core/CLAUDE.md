# reviewer-core — `@devdigest/reviewer-core`

Pure review engine: `diff → assemblePrompt → LLM → groundFindings → Review`.
Consumed as **source** by the server (tsconfig alias); never published.

## Commands (uses npm, not pnpm)

`npm test` (vitest, stubbed `LLMProvider` — no keys / no network) · `npm run typecheck`
(doubles as `build`; the package never emits JS).

## Hard constraints

- **NO DB / GitHub / filesystem / env / network.** The only side effect is the
  **injected** `LLMProvider`. All I/O stays in the caller (the server). Keep it pure.
- **Grounding gate is mandatory**: a finding that doesn't cite a real line in the diff
  is dropped, and the score is **recomputed** from the surviving findings — the model's
  self-reported score is ignored. Don't bypass either.
- Contracts come from `@devdigest/shared`; the public API is `src/index.ts`.
- ESM relative imports carry the `.js` extension.

## Read when

- Need the full pipeline diagram or the public API surface → read `reviewer-core/README.md`.
