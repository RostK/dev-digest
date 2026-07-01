/* hooks/blast.ts — blast radius for a PR (read from the repo-intel index).
   No review run needed: changed symbols → callers → impacted endpoints/crons. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastResponse } from "@devdigest/shared";

/** GET /pulls/:id/blast — the PR's blast radius map (+ degraded/index status). */
export function useBlastRadius(
  prId: string | null | undefined,
  opts: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["blast-radius", prId],
    queryFn: () => api.get<BlastResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId && (opts.enabled ?? true),
  });
}
