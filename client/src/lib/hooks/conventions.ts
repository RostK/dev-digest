/* hooks/conventions.ts — React Query hooks for the Conventions extractor. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ConventionCandidate } from "@devdigest/shared";

/** Candidates for the active repo (workspace-scoped on the server). */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Re-scan: sample → cheap LLM → ground → replace the candidate set. */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionCandidate[]>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(["conventions", repoId], data),
  });
}

/** Accept / reject one candidate. */
export function useSetConventionAccepted(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, accepted }: { id: string; accepted: boolean }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, { accepted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}
