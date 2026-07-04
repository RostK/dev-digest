import type { OnboardingJobStatus, OnboardingResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { OnboardingRepository } from './repository.js';
import {
  collectFacts,
  fillUsedBy,
  generateOnboarding,
  normalizeToCanonicalFive,
  shouldPersistGeneration,
} from './facts.js';
import { toJobStatus, toOnboardingResponse } from './helpers.js';
import { INDEX_JOB_KIND, ONBOARDING_JOB_KIND, REFRESH_JOB_KIND, RESYNC_JOB_KIND } from './constants.js';

/** Payload enqueued for (and consumed by) the ONBOARDING_JOB_KIND job. */
export interface OnboardingJobPayload {
  repoId: string;
}

/**
 * OnboardingService — orchestrates the per-repo onboarding tour:
 *   getTour / enqueueGeneration / getJobStatus  → the HTTP-facing surface
 *   runGenerationJob                            → the ONBOARDING_JOB_KIND handler body
 *   maybeEnqueueRegen                           → AC-24 auto-regen decision
 *   registerJobHandlers / reapStaleOnboardingJobs → boot-time wiring (called from routes.ts)
 */
export class OnboardingService {
  private repo: OnboardingRepository;

  constructor(private container: Container) {
    this.repo = new OnboardingRepository(container.db);
  }

  // ===========================================================================
  // HTTP-facing reads/writes — every one resolves the repo IN-WORKSPACE first
  // (AC-17: the `onboarding` row is keyed by repo_id only, so tenancy has to be
  // enforced here, before touching it).
  // ===========================================================================

  async getTour(workspaceId: string, repoId: string): Promise<OnboardingResponse> {
    const repo = await this.repo.getRepoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const [row, state, jobRow] = await Promise.all([
      this.repo.getTour(repoId),
      this.container.repoIntel.getIndexState(repoId),
      this.repo.latestOnboardingJob(workspaceId, repoId),
    ]);

    return toOnboardingResponse(row, state, jobRow);
  }

  /** Serves BOTH first-generate and Regenerate — always a background job (AC-9, AC-23). */
  async enqueueGeneration(workspaceId: string, repoId: string): Promise<{ job_id: string }> {
    const repo = await this.repo.getRepoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) {
      throw new ValidationError('Repo is not cloned yet — add it and wait for indexing to finish.');
    }

    const state = await this.container.repoIntel.getIndexState(repoId);
    if (state.filesIndexed <= 0) {
      throw new ValidationError('Repo is not indexed yet — index it first.');
    }

    // De-dupe: a Regenerate click racing the auto-regen hook (or a double
    // click) reuses the already-queued job instead of piling up LLM calls.
    const inFlight = await this.repo.findInFlightRegen(repoId);
    if (inFlight) return { job_id: inFlight.id };

    const job = await this.container.jobs.enqueue(workspaceId, ONBOARDING_JOB_KIND, {
      repoId,
    } satisfies OnboardingJobPayload);
    // Fire-and-forget (AC-23): the route returns the handle without awaiting the
    // job. `JobRunner.enqueue().done` REJECTS if the job fails/times out (a slow
    // or unreachable model), so swallow it here — the failure is already recorded
    // on the `jobs` row (polled via GET status). Without this the rejection is
    // unhandled and crashes the API process.
    void job.done.catch(() => {});
    return { job_id: job.id };
  }

  async getJobStatus(workspaceId: string, jobId: string): Promise<OnboardingJobStatus> {
    const row = await this.repo.getJob(workspaceId, jobId);
    if (!row) throw new NotFoundError('Job not found');
    return toJobStatus(row);
  }

  // ===========================================================================
  // The ONBOARDING_JOB_KIND handler body.
  // ===========================================================================

  /**
   * Runs in the background via JobRunner. Assembles facts, makes the ONE
   * completeStructured call (falling back to a deterministic skeleton on any
   * failure — AC-18), fills the deterministic `used_by` count, normalizes to
   * the canonical five, then persists — UNLESS the result is the fallback
   * skeleton AND a good tour already exists (never overwrite a good tour).
   */
  async runGenerationJob(repoId: string): Promise<void> {
    const repo = await this.repo.getRepoBasics(repoId);
    if (!repo || !repo.clonePath) return; // repo removed / never cloned — nothing to generate

    const facts = await collectFacts(this.container, {
      id: repoId,
      owner: repo.owner,
      name: repo.name,
      clonePath: repo.clonePath,
    });

    const { onboarding, usedFallback } = await generateOnboarding(this.container, repo.workspaceId, facts);

    if (usedFallback) {
      const existing = await this.repo.getTour(repoId);
      if (!shouldPersistGeneration(usedFallback, !!existing)) return; // AC-18: don't clobber a good tour
    }

    const filled = await fillUsedBy(this.container, repoId, onboarding);
    const normalized = normalizeToCanonicalFive(filled);
    await this.repo.upsertTour(repoId, normalized, new Date());
  }

  // ===========================================================================
  // Auto-regen (AC-24).
  // ===========================================================================

  /**
   * Enqueue a regen iff a tour EXISTS and the index advanced past
   * `generated_at`; a no-op otherwise (no tour yet → never auto-generate —
   * that stays a manual "Generate" click, AC-5).
   */
  async maybeEnqueueRegen(workspaceId: string, repoId: string): Promise<void> {
    const tour = await this.repo.getTour(repoId);
    if (!tour) return;

    const state = await this.container.repoIntel.getIndexState(repoId);
    if (state.updatedAt.getTime() <= tour.generatedAt.getTime()) return;

    const inFlight = await this.repo.findInFlightRegen(repoId);
    if (inFlight) return;

    const job = await this.container.jobs.enqueue(workspaceId, ONBOARDING_JOB_KIND, {
      repoId,
    } satisfies OnboardingJobPayload);
    // Fire-and-forget: swallow the `done` rejection so a failed auto-regen job
    // never surfaces as an unhandled rejection / process crash (see enqueueGeneration).
    void job.done.catch(() => {});
  }

  // ===========================================================================
  // Boot-time wiring — called once from routes.ts (mirrors repo-intel/routes.ts).
  // ===========================================================================

  /**
   * Registers the generation job handler + the three index-completion hooks
   * (fail-soft — see platform/jobs.ts) that drive the auto-regen decision.
   */
  registerJobHandlers(): void {
    this.container.jobs.register(ONBOARDING_JOB_KIND, async (payload) => {
      await this.runGenerationJob((payload as OnboardingJobPayload).repoId);
    });

    const onIndexCompleted = async (
      payload: unknown,
      ctx: { jobId: string; workspaceId: string; kind: string },
    ): Promise<void> => {
      const repoId = (payload as { repoId?: string }).repoId;
      if (!repoId) return;
      await this.maybeEnqueueRegen(ctx.workspaceId, repoId);
    };
    this.container.jobs.onCompleted(INDEX_JOB_KIND, onIndexCompleted);
    this.container.jobs.onCompleted(REFRESH_JOB_KIND, onIndexCompleted);
    this.container.jobs.onCompleted(RESYNC_JOB_KIND, onIndexCompleted);
  }

  /** Reap onboarding jobs left 'running' by a previous (now-dead) process. Called on boot. */
  async reapStaleOnboardingJobs(): Promise<number> {
    return this.repo.reapStale();
  }
}
