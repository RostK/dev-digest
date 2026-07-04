/* hooks/brief.ts — PR Why+Risk Brief (what/why/risk_level/risks/review_focus).
   useBrief is a PURE read — it never auto-fires generation; a screen must call
   useGenerateBrief explicitly (user-triggered) to compute/persist one. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Brief } from "../types";

/** GET /pulls/:id/brief — the persisted PR brief, or null if not yet generated. */
export function useBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["brief", prId],
    queryFn: () => api.get<Brief | null>(`/pulls/${prId}/brief`),
    enabled: prId != null,
  });
}

/** Generate (and persist) the PR brief. Invalidates the query on success. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ brief: Brief }>(`/pulls/${prId}/brief`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brief", prId] }),
  });
}
