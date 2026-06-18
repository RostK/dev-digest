/* SeverityIndicators — a compact cluster of per-severity icon+count chips
   (CRITICAL / WARNING / SUGGESTION), color-coded via the shared SEV tokens.
   WCAG-safe: each chip carries an icon + number, never color alone. Zero-count
   severities are hidden; no findings (null or all-zero) renders a muted "—".
   Pure presentation — the counts are computed upstream (server for the PR list,
   `countsOf` for the timeline). */
"use client";

import React from "react";
import { SeverityBadge, SEV, type Severity } from "@devdigest/ui";
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
  active,
  onSelect,
}: {
  counts: SeverityCounts | null | undefined;
  /** Currently-filtered severity (highlighted); others dim. */
  active?: Severity | null;
  /** When set, each chip becomes a button that toggles its severity filter. */
  onSelect?: (sev: Severity) => void;
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
        const isActive = active === sev;
        const dimmed = active != null && !isActive;
        return (
          <span
            key={sev}
            title={label}
            aria-label={label}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-pressed={onSelect ? isActive : undefined}
            onClick={
              onSelect
                ? (e) => {
                    e.stopPropagation(); // don't trigger the row's navigation
                    onSelect(sev);
                  }
                : undefined
            }
            onKeyDown={
              onSelect
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(sev);
                    }
                  }
                : undefined
            }
            style={{
              ...s.trigger,
              ...(onSelect ? s.chipClickable : null),
              ...(isActive ? s.chipActive : null),
              ...(dimmed ? s.chipDimmed : null),
            }}
          >
            <SeverityBadge severity={sev} count={counts[key]} compact />
          </span>
        );
      })}
    </span>
  );
}

export default SeverityIndicators;
