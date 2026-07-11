import type { AgentColumn, FindingRecord, ReviewRecord, RunEvent } from "@devdigest/shared";

/** ms → "8.2s"; null/undefined → "—" (never a fabricated duration). */
export function formatDurationLabel(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Overlay LIVE per-agent status onto the persisted columns from the SSE event
 * stream (AC-10/AC-11). A column already settled server-side (done/failed) is
 * left untouched (a completed multi-run renders from persisted data with no
 * stream — spec edge case); a column still `running` flips to `done` on that
 * run's first `result` event, or to `failed` (with a cleared score) on its
 * first `error` event — independently of its siblings (failure isolation).
 * `events` accumulate across every subscribed run_id, so filter by run_id
 * before inspecting `kind`.
 */
export function deriveLiveColumns(columns: AgentColumn[], events: RunEvent[]): AgentColumn[] {
  if (events.length === 0) return columns;
  return columns.map((col) => {
    if (col.status !== "running") return col;
    const forThisRun = events.filter((e) => e.runId === col.run_id);
    if (forThisRun.some((e) => e.kind === "error")) {
      return { ...col, status: "failed" as const, score: null };
    }
    if (forThisRun.some((e) => e.kind === "result")) {
      return { ...col, status: "done" as const };
    }
    return col;
  });
}

/** Flatten every review's findings into a Map keyed by finding id, so a
 *  narrow `AgentColumnFinding` (id + severity/category/title/file/start_line)
 *  can be enriched to its full `FindingRecord` (rationale/suggestion/
 *  confidence) for the expandable `AgentFindingCard` in Tabs mode. */
export function buildFindingMap(reviews: ReviewRecord[]): Map<string, FindingRecord> {
  const map = new Map<string, FindingRecord>();
  for (const review of reviews) {
    for (const finding of review.findings) map.set(finding.id, finding);
  }
  return map;
}

/** The persisted findings of ONE run (by run_id) — `RunTraceDrawer`'s
 *  `findings` prop for `View trace` (AC-21). */
export function findingsForRun(reviews: ReviewRecord[], runId: string): FindingRecord[] {
  return reviews.filter((r) => r.run_id === runId).flatMap((r) => r.findings);
}

/** "Jan 1, 2026, 12:00 AM"-style local timestamp for a history row; falls back
 *  to the raw ISO string if it doesn't parse (mirrors ReviewRunAccordion). */
export function formatRanAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
