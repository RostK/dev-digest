/* RunCostBadge — per-run cost (+ tokens), in two variants:
   - "compact"  → just the cost, e.g. "$0.012"          (PR list column, run card header)
   - "detailed" → cost · tokens, e.g. "$0.014 · 8.2K→1.3K" (verdict banner)
   No data → "—" (never "$0.00"). Pure presentation: the cost is computed
   server-side (tokens × model price); this component only formats. */
"use client";

import React from "react";
import { formatCostCompact, formatTokensShort } from "./format";

export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
  style,
}: {
  costUsd: number | null | undefined;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "detailed";
  style?: React.CSSProperties;
}) {
  const hasCost = costUsd != null;
  const hasTokens = tokensIn != null && tokensOut != null;

  // Nothing to show → em dash. In "detailed" we still render when only tokens
  // are known (e.g. an unpriced model), dropping the cost segment gracefully.
  if (!hasCost && !(variant === "detailed" && hasTokens)) {
    return (
      <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)", ...style }}>
        —
      </span>
    );
  }

  let text: string;
  if (variant === "detailed") {
    const parts: string[] = [];
    if (hasCost) parts.push(formatCostCompact(costUsd));
    if (hasTokens) parts.push(formatTokensShort(tokensIn!, tokensOut!));
    text = parts.join(" · ");
  } else {
    text = formatCostCompact(costUsd);
  }

  return (
    <span
      className="mono"
      style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap", ...style }}
    >
      {text}
    </span>
  );
}

export default RunCostBadge;
