/* hooks/multiAgent.ts — React Query hooks for the Multi-Agent Review feature
   (SPEC-06): per-agent pre-run estimates, starting a multi-run, and reading a
   multi-run (by id) or a PR's multi-run history. Mirrors lib/hooks/reviews.ts
   idioms (query keys, invalidation on mutation). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "../api";
import {
  AgentEstimate,
  type MultiAgentRun,
  type MultiAgentRunListItem,
  type MultiAgentRunRequest,
} from "@devdigest/shared";

const AgentEstimateList = z.array(AgentEstimate);

/** Per-agent pre-run time·cost estimate (derived from each agent's OWN past
   agent_runs), workspace-scoped (AC-5/AC-6). The wire response is a BARE
   `AgentEstimate[]` (the server aggregates nothing — Q2: aggregation into a
   selection's summary happens client-side), so it's validated here against
   the shared Zod contract rather than trusted via an `as`-cast. A malformed
   payload degrades to `[]` (never a fabricated per-agent number) so callers'
   `has_history` lookups just miss and render the safe no-history placeholder.
   Callers aggregate the SELECTED subset themselves. */
export function useAgentEstimates() {
  return useQuery({
    queryKey: ["multi-agent-estimates"],
    queryFn: async () => {
      const raw = await api.get<unknown>("/multi-agent/estimates");
      const parsed = AgentEstimateList.safeParse(raw);
      return parsed.success ? parsed.data : [];
    },
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
