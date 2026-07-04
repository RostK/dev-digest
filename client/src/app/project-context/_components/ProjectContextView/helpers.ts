import type { ContextBadge } from "@devdigest/shared";

/** Badge → accent colour (specs/docs/insights). Kept local to this view
 *  (not shared with ContextDocList) so the two stay self-contained — see
 *  client INSIGHTS / frontend-ui-architecture (AHA: no premature abstraction
 *  for a 3-entry map used by two independent components). */
const BADGE_COLOR: Record<ContextBadge, string> = {
  specs: "var(--accent)",
  docs: "#8b5cf6",
  insights: "#10b981",
};

export function badgeColor(badge: ContextBadge): string {
  return BADGE_COLOR[badge] ?? "var(--text-muted)";
}
