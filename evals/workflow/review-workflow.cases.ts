import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting.
 *
 * Budget: 11 Claude sessions total.
 *   - 7 × trace     → 1 session each                      = 7
 *   - 2 × activation pair (positive + near-miss negative) = 4
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): CLAUDE.md "Read When" routing + subagent dispatch, together -----------
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    // server/docs/api-contracts.md doesn't exist — CLAUDE.md actually routes API-route work to
    // server/README.md (CLAUDE.md:54), so that's the real target here.
    name: "API-route task reads server/README.md AND pulls the architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Спершу звірся з конвенціями API цього репо. Потім ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    expectFilesRead: ["server/README.md"],
    expectSubagents: ["architecture-reviewer"],
    // Two real steps (read the routed doc, then dispatch a subagent) plus historically some code
    // exploration first — this one measurably needed 5-8 turns in the real run. maxTurns:2 would
    // likely hard-fail it on isError before stopWhen ever fires, which is a budget artifact, not a
    // real routing/dispatch failure — so this case keeps more headroom than the others.
    maxTurns: 4,
  },

  // --- trace (1 session): CLAUDE.md "Read When" routing for pipeline work -----------------------
  {
    kind: "trace",
    // Tests the CLAUDE.md "Read When" routing, so the prompt must push toward CONSULTING the docs,
    // not exploring source. Earlier phrasing ("розберись, як усе влаштовано") sent the model straight
    // into schema.ts / pipeline.run.ts and it never opened the routed doc.
    // reviewer-core/docs/pipeline.md doesn't exist — CLAUDE.md actually routes pipeline work to
    // reviewer-core/README.md (CLAUDE.md:53); that's the real target.
    name: "pipeline task follows CLAUDE.md routing to reviewer-core/README.md",
    prompt:
      "Я збираюся змінити review pipeline. Перш ніж торкатися коду — звірся з настановами цього репо " +
      "(CLAUDE.md) щодо того, яку документацію треба прочитати для змін у pipeline, і прочитай саме ці документи.",
    expectFilesRead: ["reviewer-core/README.md"],
    // Historically needed several turns before settling on this doc (see the comment above about
    // the model wandering into source first) — kept above the 2-turn floor for headroom.
    maxTurns: 4,
  },

  // --- trace (1 session): "hit unexpected behavior" routes to durable-learnings docs -------------
  // Was a contrast case, but the control run (empty tmpdir) could still reach the real repo by
  // absolute path, making the negative flaky. As a single-session trace it reliably checks the
  // same routing rule. reviewer-core/insights/gotchas.md doesn't exist (no insights/ dir at all) —
  // the actual durable-learnings doc for this package is reviewer-core/INSIGHTS.md.
  {
    kind: "trace",
    name: "unexpected-behavior lookup routes to reviewer-core/INSIGHTS.md",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "У цьому репо вже мав би бути файл із задокументованими нетривіальними інженерними висновками " +
      "саме для reviewer-core — прочитай його, перш ніж щось міняти.",
    expectFilesRead: ["reviewer-core/INSIGHTS.md"],
    maxTurns: 2,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 2,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 2,
  },

  // --- trace (1 session each): remaining "Read When" rows from CLAUDE.md ------------------------
  {
    kind: "trace",
    name: "new API route/module task routes to server/README.md",
    prompt:
      "Я хочу додати новий модуль/роут у server/ — новий Fastify-роут з власним сервісом і репозиторієм. " +
      "Перш ніж торкатися коду, звірся з настановами цього репо (CLAUDE.md), який документ описує, " +
      "як тут влаштовані модулі, DI-контейнер і потік запиту, і прочитай саме цей документ.",
    expectFilesRead: ["server/README.md"],
    maxTurns: 2,
  },
  {
    kind: "trace",
    name: "repo-intel/blast-radius task routes to the repo-intel module README",
    prompt:
      "Я хочу змінити, як рахується blast radius для repo map у repo-intel. За настановами цього репо " +
      "(CLAUDE.md), який документ описує repo indexing і repo map, і прочитай саме його перед тим, як " +
      "щось міняти.",
    expectFilesRead: ["server/src/modules/repo-intel/README.md"],
    // The real run drifted into blast/README.md and blast-radius.md before settling here (7 turns)
    // — "blast radius" in the prompt pulls the model toward the sibling blast/ module. Kept above
    // the 2-turn floor so that drift doesn't turn into a guaranteed isError failure.
    maxTurns: 4,
  },
  {
    kind: "trace",
    name: "new client data hook task routes to client/README.md",
    prompt:
      "Я хочу додати новий data hook на клієнті (client/), який ходить у наш API. Перш ніж писати код, " +
      "звірся з настановами цього репо (CLAUDE.md), який документ описує, як організовані UI-роути й " +
      "дата-хуки в client/, і прочитай саме його.",
    expectFilesRead: ["client/README.md"],
    // Took 5 turns in the real run (with the Stop hook still active, since disabled) — kept above
    // the 2-turn floor as a precaution until we have a clean data point without hook noise.
    maxTurns: 4,
  },
  {
    kind: "trace",
    name: "test placement question routes to TESTING.md",
    prompt:
      "Я не певен, чи мій новий тест має бути unit-тестом чи integration-тестом, і куди його класти. " +
      "За настановами цього репо (CLAUDE.md), який документ відповідає на це питання? Прочитай саме його, " +
      "перш ніж радити мені, куди класти тест.",
    expectFilesRead: ["TESTING.md"],
    maxTurns: 2,
  },

  // --- activation pair (2 sessions): write-spec must fire when requirements are still open, --------
  // and must NOT fire once a spec already exists and the ask is about planning the HOW.
  {
    kind: "activation",
    name: "write-spec activates when requirements for a new feature are not yet formalized",
    prompt:
      "Хочу зробити нову фічу — сповіщення в Slack про нові ревʼю. Вимог ще немає. Перш ніж щось " +
      "планувати чи писати код, давай спершу формалізуємо вимоги для цієї фічі.",
    skill: "write-spec",
    shouldActivate: true,
    // activation has no early-stop, and write-spec's job is to DISPATCH spec-author — activated()
    // only needs the Skill call or a SKILL.md read to register (typically turn 1), so this would
    // likely survive even maxTurns:2, but kept at 4 for headroom since a false activation-negative
    // here is expensive to misdiagnose (looks like "write-spec doesn't activate" when it's really
    // just a turn-budget cutoff).
    maxTurns: 4,
    // write-spec dispatches the spec-author subagent (ground + analyze + draft), which routinely
    // runs past the file's global 240s testTimeout regardless of maxTurns — maxTurns bounds the
    // parent session's conversational turns, not a nested subagent's own wall-clock time.
    testTimeoutMs: 480_000,
  },
  {
    kind: "activation",
    name: "near-miss negative — planning the HOW from an already-approved spec must NOT trigger write-spec",
    prompt:
      "У нас вже є затверджений specs/cross/SPEC-04-2026-07-02-pr-why-risk-brief.md з усіма вимогами. " +
      "Розпланай, як це імплементувати технічно — файли, модулі, порядок робіт.",
    skill: "write-spec",
    shouldActivate: false,
    maxTurns: 2,
  },
];
