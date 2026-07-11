import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CiExportInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';

/**
 * CI module (SPEC-07 T3) — Export-to-CI + CI Runs.
 *   POST /agents/:id/ci/preview        → preview the export bundle (no side effect)
 *   POST /agents/:id/ci/install        → install (open a PR, or return files-only)
 *   POST /ci/installations/:id/sync    → pull GitHub Actions run results
 *   GET  /ci/runs                      → all CI runs in the workspace (CI Runs page)
 *   GET  /agents/:id/ci/installations  → an agent's CI installations (CI tab)
 *   GET  /agents/:id/ci/runs           → an agent's CI run history (CI tab)
 *
 * "Fail CI on" is NOT a route here — it reuses the existing `PUT /agents/:id`
 * (already accepts `ci_fail_on`).
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/ci/install',
    { schema: { params: IdParams, body: CiExportInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.install(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/ci/installations/:id/sync',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.sync(workspaceId, req.params.id);
    },
  );

  app.get('/ci/runs', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listRuns(workspaceId);
  });

  app.get(
    '/agents/:id/ci/installations',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listInstallationsForAgent(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agents/:id/ci/runs',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listRunsForAgent(workspaceId, req.params.id);
    },
  );
}
