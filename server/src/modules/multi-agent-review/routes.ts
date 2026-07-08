import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MultiAgentRunRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MultiAgentReviewService } from './service.js';

/**
 * multi-agent-review module (SPEC-06) — the concurrent multi-agent fan-out.
 *   POST /pulls/:id/multi-agent-run   {agent_ids}  → start ONE new multi-run; returns its id
 *   GET  /multi-agent-runs/:id                     → the composed MultiAgentRun (columns + conflicts)
 *   GET  /pulls/:id/multi-agent-runs               → the PR's multi-run history, newest first
 *   GET  /multi-agent/estimates                    → per-agent pre-run time·cost estimate
 *
 * Every route resolves `getContext()` and scopes by workspace_id; a cross-
 * workspace pr/multi-run/agent id is a NotFoundError (404), never a 200 with
 * someone else's data (A01 IDOR).
 */
export default async function multiAgentReviewRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new MultiAgentReviewService(app.container);

  // ---- Start a multi-run (fans out N concurrent single-agent reviews) -----
  // Tight per-route limit, same as the single-agent trigger: each call can
  // fan out to N expensive LLM runs at once.
  app.post(
    '/pulls/:id/multi-agent-run',
    {
      schema: { params: IdParams, body: MultiAgentRunRequest },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.start(workspaceId, req.params.id, req.body.agent_ids);
    },
  );

  // ---- Read a composed multi-run --------------------------------------------
  app.get('/multi-agent-runs/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getMultiRun(workspaceId, req.params.id);
  });

  // ---- A PR's multi-run history, newest first (AC-25) -----------------------
  app.get('/pulls/:id/multi-agent-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listForPr(workspaceId, req.params.id);
  });

  // ---- Pre-run per-agent estimates (AC-5/AC-6; zero model calls) -----------
  app.get('/multi-agent/estimates', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.estimates(workspaceId);
  });
}
