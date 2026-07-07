import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalService } from './service.js';

/** `POST /eval-cases/from-finding` body — finding-CENTRIC (no agent id in the
 *  path): the server derives the owning agent from the finding itself via
 *  `createCaseFromFinding`. Matches the committed client hook's contract. */
const FromFindingBody = z.object({ finding_id: z.string().uuid() });

/** `GET /evals/compare?a=&b=` — both are eval run-group ids. A group id is a
 *  `randomUUID()` stored in the `eval_runs.group_id` UUID column, so it is
 *  always a well-formed UUID. Validating as `.uuid()` rejects a malformed id
 *  with a clean 422 up front — without it, a non-UUID string reaches the
 *  repository query and Postgres raises `invalid input syntax for type uuid`,
 *  surfacing as an opaque 500 (a valid-but-unknown id still 404s downstream). */
const CompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });

/**
 * evals module (SPEC-05 T4 — read side + routes; write side/schema/scorer are
 * T3, committed).
 *   POST   /agents/:id/eval-runs          → run the agent's eval set now
 *   POST   /eval-cases/from-finding       → {finding_id} create a case from a finding
 *   GET    /agents/:id/eval-cases         → cases + latest-run state
 *   GET    /agents/:id/eval-runs          → aggregated run-history (most-recent first)
 *   GET    /agents/:id/eval-dashboard     → per-agent dashboard (metrics/trend/alert)
 *   GET    /evals/compare?a=&b=           → side-by-side run-group comparison
 *   GET    /evals                         → workspace-wide dashboard
 */
export default async function evalsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new EvalService(container);

  // ---- Run the eval set (mutating; fans out to the LLM once per case) -----
  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.runSet(workspaceId, req.params.id);
      // Prefer the freshly-persisted group aggregate (carries the real
      // summed cost_usd); fall back to the runSet result itself for an
      // all-skipped set (zero rows written → no group aggregate to read).
      const persisted = await service.runGroupById(workspaceId, result.group_id);
      return (
        persisted ?? {
          group_id: result.group_id,
          agent_version: result.agent_version,
          ran_at: result.ran_at,
          recall: result.aggregate.recall,
          precision: result.aggregate.precision,
          citation_accuracy: result.aggregate.citation_accuracy,
          traces_passed: result.aggregate.traces_passed,
          traces_total: result.aggregate.traces_total,
          cost_usd: null,
        }
      );
    },
  );

  // ---- Create a case from a finding (finding-centric — no agent id in path) -
  app.post('/eval-cases/from-finding', { schema: { body: FromFindingBody } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const created = await service.createCaseFromFinding(workspaceId, req.body.finding_id);
    const withState = await service.caseWithState(workspaceId, created.id);
    if (!withState) throw new NotFoundError('Eval case not found immediately after creation');
    return withState;
  });

  // ---- Reads ----------------------------------------------------------------
  app.get('/agents/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listCasesWithState(workspaceId, req.params.id);
  });

  app.get('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listRunGroupsForAgent(workspaceId, req.params.id);
  });

  app.get('/agents/:id/eval-dashboard', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.dashboardForAgent(workspaceId, req.params.id);
  });

  app.get('/evals/compare', { schema: { querystring: CompareQuery } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.compareGroups(workspaceId, req.query.a, req.query.b);
  });

  app.get('/evals', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.globalDashboard(workspaceId);
  });
}
