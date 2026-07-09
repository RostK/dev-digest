/* hooks/ci.ts — Export-to-CI (SPEC-07): preview/install a bundle, list/sync
   installations + runs. Mirrors the agents/agentSkills hook conventions
   (query keys `["resource", ...ctx]`, invalidate on mutation). Fail-CI-on
   reuses the EXISTING `useUpdateAgent` (agents.ts) — no new endpoint here. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { CiExport, CiExportInput, CiFile, CiInstallation, CiRun } from "@devdigest/shared";

/** Generate the export bundle for a target/config — no side effect (AC-4). */
export function useCiPreview(agentId: string) {
  return useMutation({
    mutationFn: (input: CiExportInput) => api.post<CiFile[]>(`/agents/${agentId}/ci/preview`, input),
  });
}

/** Install the export: "open_pr" commits + opens/reuses a PR, "files" just returns the bundle
 *  (AC-13/AC-14). Upserts a `ci_installations` row on a GHA `open_pr` export (AC-15). */
export function useCiInstall(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiExportInput) => api.post<CiExport>(`/agents/${agentId}/ci/install`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-ci-installations", agentId] });
      qc.invalidateQueries({ queryKey: ["agent-ci-runs", agentId] });
      qc.invalidateQueries({ queryKey: ["ci-runs"] });
    },
  });
}

/** Pull the installation's GitHub Actions runs + ingest them into `ci_runs` (AC-16/AC-17). */
export function useSyncInstallation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (installationId: string) => api.post<CiRun[]>(`/ci/installations/${installationId}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ci-runs"] });
      // agentId isn't known here — invalidate every `["agent-ci-runs", *]` entry (fuzzy match).
      qc.invalidateQueries({ queryKey: ["agent-ci-runs"] });
    },
  });
}

/** Global CI Runs page (AC-18) — every run, workspace-scoped server-side. */
export function useCiRuns() {
  return useQuery({
    queryKey: ["ci-runs"],
    queryFn: () => api.get<CiRun[]>("/ci/runs"),
  });
}

/** An agent's CI installations (CI tab, AC-19). */
export function useAgentInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-ci-installations", agentId],
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci/installations`),
    enabled: !!agentId,
  });
}

/** An agent's CI run history across all its installations (CI tab, AC-19). */
export function useAgentCiRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-ci-runs", agentId],
    queryFn: () => api.get<CiRun[]>(`/agents/${agentId}/ci/runs`),
    enabled: !!agentId,
  });
}
