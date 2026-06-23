/* hooks/agentSkills.ts — an agent's linked skills (Agent Editor → Skills tab). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AgentSkillLink } from "@devdigest/shared";

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** One binding row sent on save: list order = prompt order. */
export interface SkillBinding {
  skill_id: string;
  enabled: boolean;
}

/** Replace/reorder/enable the agent's whole skill set in one call. */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skills: SkillBinding[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skills }),
    onSuccess: (data) => qc.setQueryData(["agent-skills", agentId], data),
  });
}
