/* hooks/multiAgent.ts — React Query hooks for the Multi-Agent Review feature
   (SPEC-06): per-agent pre-run estimates, starting a multi-run, and reading a
   multi-run (by id) or a PR's multi-run history. Mirrors lib/hooks/reviews.ts
   idioms (query keys, invalidation on mutation). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  MultiAgentEstimate,
  MultiAgentRun,
  MultiAgentRunListItem,
  MultiAgentRunRequest,
} from "@devdigest/shared";

/** Per-agent pre-run time·cost estimate (derived from each agent's OWN past
   agent_runs), workspace-scoped (AC-5/AC-6). No usable history → `has_history:
   false`; callers aggregate the SELECTED subset themselves (never trust a
   fabricated number for an agent with no history). */
export function useAgentEstimates() {
  return useQuery({
    queryKey: ["multi-agent-estimates"],
    queryFn: () => api.get<MultiAgentEstimate>("/multi-agent/estimates"),
  });
}

export interface StartMultiRunInput {
  prId: string;
  agentIds: string[];
}

/** Start a NEW multi-run over the selected agent set (AC-2/AC-7) — a fresh
   `multi_agent_runs` row, never overwriting a prior one. Resolves to `{ id }`
   so the caller can navigate to `/multi-agent/runs/:id`. Invalidates the PR's
   multi-run history so a re-run appears in the list immediately (AC-25). */
export function useStartMultiRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: StartMultiRunInput) =>
      api.post<{ id: string }>(`/pulls/${prId}/multi-agent-run`, {
        agent_ids: agentIds,
      } satisfies MultiAgentRunRequest),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["multi-agent-runs", prId] });
    },
  });
}

/** One multi-run by id — columns (one per agent) + conflicts + totals; the
   results page's main read (AC-8/AC-9). */
export function useMultiRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run", id],
    queryFn: () => api.get<MultiAgentRun>(`/multi-agent-runs/${id}`),
    enabled: !!id,
  });
}

/** A PR's past multi-runs, most-recent first (AC-25). */
export function useMultiRunHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-runs", prId],
    queryFn: () => api.get<MultiAgentRunListItem[]>(`/pulls/${prId}/multi-agent-runs`),
    enabled: !!prId,
  });
}
