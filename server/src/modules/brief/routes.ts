import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Brief } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefService } from './service.js';

/**
 * PR Why+Risk Brief module — a cached, LLM-assisted "what changed / why / how
 * risky" summary for a tracked PR.
 *
 *   GET  /pulls/:id/brief → cached Brief | null (ZERO LLM; NotFoundError cross-workspace)
 *   POST /pulls/:id/brief → generate/regenerate → { brief: Brief }
 *
 * GET has no response schema (fastify-type-provider-zod validates INPUT only)
 * so the returned object serializes as-is — the returned Brief MUST already
 * match the vendored contract (server/INSIGHTS.md:31).
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BriefService(app.container);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams } },
    async (req): Promise<Brief | null> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getCachedBrief(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    { schema: { params: IdParams } },
    async (req): Promise<{ brief: Brief }> => {
      const { workspaceId } = await getContext(app.container, req);
      const brief = await service.generateBrief(workspaceId, req.params.id, (m) => req.log.info(m));
      return { brief };
    },
  );
}
