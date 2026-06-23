import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — scan a cloned repo for house-rules, grounded against real
 * code. Accepted candidates become Skills via the existing `POST /skills`.
 *   POST  /repos/:id/conventions/extract → (re)scan → grounded candidates
 *   GET   /repos/:id/conventions         → list candidates (workspace-scoped)
 *   PATCH /conventions/:id               → accept / reject one candidate
 */

const AcceptBody = z.object({ accepted: z.boolean() });

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.extract(workspaceId, req.params.id);
      reply.status(201);
      return result;
    },
  );

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: AcceptBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.setAccepted(workspaceId, req.params.id, req.body.accepted);
      if (!updated) throw new NotFoundError('Convention not found');
      return updated;
    },
  );
}
