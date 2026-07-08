/** ms → "8.2s"; null/undefined → "—" (never a fabricated duration). Small,
 *  single-purpose duplicate of the same one-liner in a few sibling
 *  components (RunTraceDrawer/helpers.ts, ConfigureRunView) — the repo's
 *  established convention for this exact formatter (see client/INSIGHTS.md). */
export function formatDurationLabel(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Local timestamp for a history row; falls back to the raw ISO string if it
 *  doesn't parse (mirrors ReviewRunAccordion's `formatWhen`). */
export function formatRanAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
