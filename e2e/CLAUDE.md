# e2e — `@devdigest/e2e`

Deterministic browser end-to-end for the web app, driven by Vercel **agent-browser**
(Rust + CDP). **No Playwright, no LLM, no API key.**

## Run (uses npm)

`../scripts/e2e.sh` — spins an **isolated** Postgres + API + web on alt ports
(5433 / 3101 / 3100 by default), migrates + seeds, runs `tsx run.ts`, then tears it
all down. Never touches your dev DB. Override ports with `E2E_PG_PORT` / `E2E_API_PORT`
/ `E2E_WEB_PORT`.

## Conventions

- Each flow is a JSON command list at `specs/NN-name.flow.json`, run in order against
  one shared browser session by `run.ts`.
- Flows must stay **deterministic** — no LLM calls, no live network; assert against
  seeded data only.

## Use when

- Run, spec format, commands → read `e2e/README.md`
- Flow specs → read `e2e/specs/` · Deep-dives → read `e2e/docs/` · findings → read `e2e/INSIGHTS.md`
