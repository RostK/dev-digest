import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { BlastResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * Blast radius module — the PR impact map, served purely from the repo-intel
 * index (no parsing at request time, ≤1 model call for the summary).
 *
 *   GET  /pulls/:id/blast   → BlastResponse for a tracked PR (files from pr_files)
 *   POST /repos/:id/blast   → BlastResponse for an explicit file set (MCP-facing)
 */

const FilesBody = z.object({ files: z.array(z.string().min(1)).min(1).max(1000) });

export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams } },
    async (req): Promise<BlastResponse> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.blastForPr(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/blast',
    { schema: { params: IdParams, body: FilesBody } },
    async (req): Promise<BlastResponse> => {
      // Workspace-scope the repo so this file-keyed route can't read another
      // tenant's repo map (the facade read itself is tenant-agnostic).
      const { workspaceId } = await getContext(app.container, req);
      return service.blastForFiles(workspaceId, req.params.id, req.body.files);
    },
  );
}
