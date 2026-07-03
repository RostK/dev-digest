import type { RiskSeverity } from "@devdigest/shared";

/** Risk-level color tokens — paired with the text label in the UI (AC-9: never
 *  color alone). Mirrors the CRITICAL/WARNING/SUGGESTION token pattern used by
 *  SeverityIndicators, but keyed to the Brief's high/medium/low scale. */
export const RISK_COLOR: Record<RiskSeverity, { color: string; bg: string }> = {
  high: { color: "var(--crit)", bg: "var(--crit-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  low: { color: "var(--ok)", bg: "var(--ok-bg)" },
};

/** Compact relative time for "generated {relative}" (e.g. "3h ago", "2d ago"). */
export function relativeTimeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const m = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
