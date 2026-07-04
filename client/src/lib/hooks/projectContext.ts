/* hooks/projectContext.ts — discovery of the active repo's project-context
   documents (Project Context screen + the Agent/Skill Context editors, T8/T9). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProjectContextDoc } from "@devdigest/shared";

/**
 * All discovered specs|docs|insights markdown documents for a repo. Per NC-2
 * (SPEC-02), the browse/attach list is always seeded from the ACTIVE/selected
 * repo — callers pass `repoId` from `useActiveRepo()`, not a route param.
 */
export function useProjectContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["project-context-docs", repoId],
    queryFn: () => api.get<ProjectContextDoc[]>(`/repos/${repoId}/project-context/docs`),
    enabled: !!repoId,
  });
}
