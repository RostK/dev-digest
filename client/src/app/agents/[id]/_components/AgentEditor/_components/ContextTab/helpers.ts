import type { ContextAttachment, ProjectContextDoc } from "@devdigest/shared";
import type { ContextDocListItem } from "@/components/ContextDocList";

/**
 * Merge every discovered project-context doc with the agent's saved
 * attachments into one ordered list for `ContextDocList`: attached docs
 * first (in saved order), then the remaining discovered docs appended
 * (unattached, A→Z) so a never-attached doc can still be toggled on.
 * Mirrors the Skills tab's `mergeBindings`. An attachment whose path is no
 * longer discovered (deleted/renamed doc) is dropped — nothing to
 * attach/reorder for it in the editor.
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

function toItem(doc: ProjectContextDoc): ContextDocListItem {
  return { path: doc.path, badge: doc.badge, tokens: doc.tokens };
}

/** Pure array move used by drag-reorder (mirrors the Skills tab's `move`). */
export function move<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return arr;
  next.splice(to, 0, item);
  return next;
}
