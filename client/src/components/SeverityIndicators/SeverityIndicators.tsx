/* SeverityIndicators — a compact cluster of per-severity icon+count chips
   (CRITICAL / WARNING / SUGGESTION), color-coded via the shared SEV tokens.
   WCAG-safe: each chip carries an icon + number, never color alone. Zero-count
   severities are hidden; no findings (null or all-zero) renders a muted "—".
   Pure presentation — the counts are computed upstream (server for the PR list,
   `countsOf` for the timeline). */
"use client";

import React from "react";
import { SeverityBadge, SEV } from "@devdigest/ui";
import { type SeverityCounts, totalOf } from "./helpers";
import { s } from "./styles";

/** Render order — most severe first, matching the cards' visual priority. */
const ORDER = [
  { sev: "CRITICAL", key: "critical" },
  { sev: "WARNING", key: "warning" },
  { sev: "SUGGESTION", key: "suggestion" },
] as const;

export function SeverityIndicators({
  counts,
}: {
  counts: SeverityCounts | null | undefined;
}) {
  if (!counts || totalOf(counts) === 0) {
    return <span style={s.empty}>—</span>;
  }
  return (
    <span style={s.cluster}>
      {ORDER.filter(({ key }) => counts[key] > 0).map(({ sev, key }) => {
        // Compact badges are icon+number only; the wrapper supplies an
        // accessible name ("2 Critical") for screen readers + a hover title.
        const label = `${counts[key]} ${SEV[sev].label}`;
        return (
          <span key={sev} title={label} aria-label={label} style={s.trigger}>
            <SeverityBadge severity={sev} count={counts[key]} compact />
          </span>
        );
      })}
    </span>
  );
}

export default SeverityIndicators;
