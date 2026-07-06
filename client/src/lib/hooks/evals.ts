/* hooks/evals.ts — React Query hooks for the A4 eval / CI pipeline (L06).
   Create eval cases from findings, list/run an agent's eval set, and read the
   per-agent + global eval dashboards. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalCaseWithState,
  EvalCompare,
  EvalDashboard,
  EvalRunGroup,
  GlobalEvalDashboard,
} from "@devdigest/shared";

// ---- Eval cases for an agent ----
/** An agent's eval cases enriched with their latest-run pass/fail state. */
export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCaseWithState[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

/** Create an eval case from an existing finding (captures the PR's diff as the
 *  case input + the finding as the expected output). Invalidates the agent's
 *  eval-cases list so the new case appears immediately. */
export function useCreateEvalFromFinding(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (findingId: string) =>
      api.post<EvalCaseWithState>(`/agents/${agentId}/eval-cases/from-finding`, {
        finding_id: findingId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    },
  });
}

// ---- Eval run groups for an agent ----
/** Run-history rows (one per full eval-suite execution) for an agent. */
export function useAgentEvalRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-runs", agentId],
    queryFn: () => api.get<EvalRunGroup[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
  });
}

/** Run the agent's whole eval set now. Invalidates eval-cases, eval-runs, AND
 *  the eval-dashboard for that agent since all three change together. */
export function useRunEvalSet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) =>
      api.post<EvalRunGroup>(`/agents/${agentId}/eval-runs`),
    onSuccess: (_d, agentId) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] });
    },
  });
}

// ---- Dashboards ----
/** Aggregate eval dashboard (trend + current metrics) for one agent. */
export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-dashboard", agentId],
    queryFn: () => api.get<EvalDashboard>(`/agents/${agentId}/eval-dashboard`),
    enabled: !!agentId,
  });
}

/** Workspace-wide eval dashboard: recent run groups across all agents + a
 *  per-agent rollup. */
export function useGlobalEvalDashboard() {
  return useQuery({
    queryKey: ["eval-global"],
    queryFn: () => api.get<GlobalEvalDashboard>("/evals"),
  });
}

// ---- Compare two run groups ----
/** Side-by-side comparison of two eval run groups (e.g. before/after a prompt
 *  edit). Disabled until both group ids are known. */
export function useEvalCompare(
  a: string | null | undefined,
  b: string | null | undefined,
) {
  return useQuery({
    queryKey: ["eval-compare", a, b],
    queryFn: () =>
      api.get<EvalCompare>(`/evals/compare?a=${encodeURIComponent(a!)}&b=${encodeURIComponent(b!)}`),
    enabled: !!a && !!b,
  });
}
