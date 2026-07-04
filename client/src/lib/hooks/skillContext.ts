/* hooks/skillContext.ts — a skill's own attached Project Context docs (Skill
   editor → Config tab → "Project context to use" section, SPEC-02 T9).
   Mirrors hooks/agentSkills.ts. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ContextAttachment } from "@devdigest/shared";

/** Ordered set of project-context docs this skill has attached (AC-6). */
export function useSkillContext(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId],
    queryFn: () => api.get<ContextAttachment[]>(`/skills/${skillId}/context`),
    enabled: !!skillId,
  });
}

/**
 * Replace/reorder the skill's attached context docs in one call — ordered
 * PATHS only, the server persists array position as `order` and never stores
 * document text (AC-8).
 */
export function useSetSkillContext(skillId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => api.post<ContextAttachment[]>(`/skills/${skillId}/context`, paths),
    onSuccess: (data) => qc.setQueryData(["skill-context", skillId], data),
  });
}
