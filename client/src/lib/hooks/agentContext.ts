/* hooks/agentContext.ts — an agent's own attached Project Context documents
   (Agent Editor → Context tab, SPEC-02 T8). Mirrors agentSkills.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ContextAttachment } from "@devdigest/shared";

export function useAgentContext(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId],
    queryFn: () => api.get<ContextAttachment[]>(`/agents/${agentId}/context`),
    enabled: !!agentId,
  });
}

/**
 * Replace/reorder the agent's own attached document set in one call — ordered
 * paths only (AC-4, AC-8: never document text); the server derives each
 * `order` from the array position, so list order = prompt order.
 */
export function useSetAgentContext(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.post<ContextAttachment[]>(`/agents/${agentId}/context`, paths),
    onSuccess: (data) => qc.setQueryData(["agent-context", agentId], data),
  });
}
