import type { FindingRecord } from "@devdigest/shared";

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** Stable per-finding element id for the disabled Learn/Reply "coming soon"
 *  tooltip (the `aria-describedby` target) — unique across a page rendering
 *  many cards. */
export function tooltipId(findingId: string, action: "learn" | "reply"): string {
  return `agent-finding-${findingId}-${action}-tooltip`;
}
