import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { OnboardingJobStatus, OnboardingResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

/** `/repos/:id/onboarding/job/:jobId` — both path segments are uuids. */
const JobParams = z.object({ id: z.string().uuid(), jobId: z.string().uuid() });

/**
 * Onboarding module — the per-repo AI-generated onboarding tour.
 *   GET  /repos/:id/onboarding             → OnboardingResponse (tour + freshness +
 *                                             latest job; `tour: null` when none, NEVER 404)
 *   POST /repos/:id/onboarding/generate     → enqueue generation (first-generate AND
 *                                             Regenerate); 202 { job_id }
 *   GET  /repos/:id/onboarding/job/:jobId   → OnboardingJobStatus (workspace-scoped poll target)
 *
 * No public/unauthenticated share endpoint exists here (AC-21) — every route
 * resolves getContext() and is workspace-scoped; "Share" just copies the
 * current authenticated page URL client-side.
 *
 * Job-handler + auto-regen-hook registration happens here, once, at boot —
 * mirrors repo-intel/routes.ts:29-30.
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new OnboardingService(container);
  service.registerJobHandlers();

  // Reap onboarding jobs left 'running' by a previous (now-dead) process —
  // otherwise they'd show as perpetually in-flight in the UI. Mirrors
  // ReviewService.reapStaleRuns, but runs HERE (this module's own boot
  // block) rather than app.ts, per the SPEC-03 plan.
  try {
    const reaped = await service.reapStaleOnboardingJobs();
    if (reaped > 0) app.log.info({ reaped }, 'reaped stale running onboarding jobs on boot');
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'onboarding stale-job reaping failed (non-fatal)');
  }

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams } },
    async (req): Promise<OnboardingResponse> => {
      const { workspaceId } = await getContext(container, req);
      return service.getTour(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding/generate',
    { schema: { params: IdParams } },
    async (req, reply): Promise<{ job_id: string }> => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.enqueueGeneration(workspaceId, req.params.id);
      reply.code(202);
      return result;
    },
  );

  app.get(
    '/repos/:id/onboarding/job/:jobId',
    { schema: { params: JobParams } },
    async (req): Promise<OnboardingJobStatus> => {
      const { workspaceId } = await getContext(container, req);
      return service.getJobStatus(workspaceId, req.params.jobId);
    },
  );
}
