import type { ContextBadge, ProjectContextDoc, ContextAttachment } from "@devdigest/shared";
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

/** Trim a discovered doc to the row shape the list renders (drops
 *  used_by/coverage — those are Project-Context-screen stats). */
function toItem(doc: ProjectContextDoc): ContextDocListItem {
  return { path: doc.path, badge: doc.badge, tokens: doc.tokens };
}

/**
 * Merge every discovered project-context doc with a saved attachment set into
 * ONE ordered list for `ContextDocList` + the selected-path set: attached docs
 * first (in saved `order`), then the remaining discovered docs appended
 * (unattached, path A→Z) so a never-attached doc can still be toggled on. An
 * attachment whose path is no longer discovered (deleted/renamed doc) is
 * dropped — nothing to attach/reorder for it. Shared by the Agent Editor
 * Context tab (T8) and the Skill Config context section (T9). Because unattached
 * docs are re-sorted A→Z, list order != discovered order — tests must target a
 * row by its path, not its index.
 */
export function mergeContextDocs(
  docs: ProjectContextDoc[],
  attachments: ContextAttachment[],
): { items: ContextDocListItem[]; selected: Set<string> } {
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const selected = new Set<string>();
  const attached: ContextDocListItem[] = [];
  for (const a of [...attachments].sort((x, y) => x.order - y.order)) {
    const doc = byPath.get(a.path);
    if (!doc) continue;
    selected.add(doc.path);
    attached.push(toItem(doc));
  }
  const unattached = docs
    .filter((d) => !selected.has(d.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(toItem);
  return { items: [...attached, ...unattached], selected };
}

/** Pure array move used by drag-reorder. */
export function move<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return arr;
  next.splice(to, 0, item);
  return next;
}
