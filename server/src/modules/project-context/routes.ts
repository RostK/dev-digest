/**
 * project-context HTTP module (SPEC-02 T4).
 *
 *   GET /repos/:id/project-context/docs → ProjectContextDoc[]
 *
 * Discovers the repo's context docs (specs/docs/insights markdown, T3 walk)
 * and attaches each doc's token count + how many of this workspace's agents
 * use it (own or inherited from an enabled skill) as `used_by`/`coverage`.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ProjectContextDoc } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ProjectContextService } from './service.js';

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ProjectContextService(app.container);

  app.get(
    '/repos/:id/project-context/docs',
    { schema: { params: IdParams } },
    async (req): Promise<ProjectContextDoc[]> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listDocs(workspaceId, req.params.id);
    },
  );
}
