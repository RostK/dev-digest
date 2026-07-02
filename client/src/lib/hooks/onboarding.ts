/* hooks/onboarding.ts — Onboarding Tour (SPEC-03): the persisted tour + an
   async generate/regenerate job. GET returns one envelope (tour, freshness,
   and the latest IN-FLIGHT job) so the view can render the whole state from a
   single fetch; POST enqueues without blocking on the model; the dedicated
   job-status route is polled while queued/running. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingResponse, OnboardingJobStatus } from "@devdigest/shared";

const ACTIVE_JOB_STATUSES = new Set<OnboardingJobStatus["status"]>(["queued", "running"]);

/** GET /repos/:id/onboarding — tour + files_indexed/generated_at/indexed/stale
    + the latest in-flight job (if any). Polls while that embedded job is
    queued/running so a page load mid-generation (manual OR auto-regen) self-
    resolves without extra wiring; stops once the job settles. */
export function useOnboarding(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding", repoId],
    queryFn: () => api.get<OnboardingResponse>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: (query) => {
      const job = query.state.data?.job;
      return job && ACTIVE_JOB_STATUSES.has(job.status) ? 2000 : false;
    },
  });
}

/** POST /repos/:id/onboarding/generate — enqueues the FIRST generation or a
    Regenerate; returns a job handle without blocking on the model call.
    Invalidates the envelope so it immediately reflects the newly-queued job
    (which in turn drives useOnboarding's own poll). */
export function useGenerateOnboarding(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ job_id: string }>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding", repoId] }),
  });
}

/** GET /repos/:id/onboarding/job/:jobId — a specific job's status. Polls
    while queued/running; stops on done/failed. Used for the just-triggered
    Generate/Regenerate job (via its returned job_id) so the header's
    updating/stale indicator can track it directly rather than waiting on the
    envelope's own poll tick. */
export function useOnboardingJob(
  repoId: string | null | undefined,
  jobId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["onboarding-job", repoId, jobId],
    queryFn: () => api.get<OnboardingJobStatus>(`/repos/${repoId}/onboarding/job/${jobId}`),
    enabled: !!repoId && !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && ACTIVE_JOB_STATUSES.has(status) ? 2000 : false;
    },
  });
}
