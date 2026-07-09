/* relative-time.ts — compact relative time ("3h", "2d"), shared across the CI
   tab + CI Runs page (2nd use — promoted out of the pulls-list-only copy per
   the "promote to shared only on the second use" rule; that copy stays local
   to `app/repos/[repoId]/pulls/helpers.ts` since it's a different feature). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
