import type { ContextBadge } from "@devdigest/shared";
import type { ContextDocListItem } from "./ContextDocList";

/** Badge → accent colour (specs/docs/insights). Self-contained to this
 *  component on purpose (ContextDocList must stand alone for T8/T9). */
const BADGE_COLOR: Record<ContextBadge, string> = {
  specs: "var(--accent)",
  docs: "#8b5cf6",
  insights: "#10b981",
};

export function badgeColor(badge: ContextBadge): string {
  return BADGE_COLOR[badge] ?? "var(--text-muted)";
}

/** Display-only filter (AC-4: narrows the visible list, never mutates
 *  selection/order) — case-insensitive substring match on the doc path. */
export function filterItems(
  items: ContextDocListItem[],
  filter: string,
): ContextDocListItem[] {
  const q = filter.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => it.path.toLowerCase().includes(q));
}

/** Sum of tokens for the SELECTED items only — what would actually be
 *  injected into the prompt for the current attachment set. */
export function totalTokens(
  items: ContextDocListItem[],
  selected: ReadonlySet<string>,
): number {
  return items
    .filter((it) => selected.has(it.path))
    .reduce((sum, it) => sum + it.tokens, 0);
}
