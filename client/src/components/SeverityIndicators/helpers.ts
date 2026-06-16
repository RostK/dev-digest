import type { FindingRecord } from "@devdigest/shared";

/** Per-severity tally shape — mirrors PrMeta.findings and the server's
 *  SeverityCounts (pulls/status.ts). Only the three real finding severities. */
export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

export function totalOf(c: SeverityCounts): number {
  return c.critical + c.warning + c.suggestion;
}

/**
 * Tally OPEN (non-dismissed) findings by severity — the client mirror of the
 * server's `rollupSeverities`, so the PR-detail timeline cluster matches the
 * PR-list one (which the server computes the same way).
 */
export function countsOf(findings: FindingRecord[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.dismissed_at) continue;
    if (f.severity === "CRITICAL") c.critical += 1;
    else if (f.severity === "WARNING") c.warning += 1;
    else if (f.severity === "SUGGESTION") c.suggestion += 1;
  }
  return c;
}

/** Open (non-dismissed) findings only — what the indicators + card should show. */
export function openFindings(findings: FindingRecord[]): FindingRecord[] {
  return findings.filter((f) => !f.dismissed_at);
}
