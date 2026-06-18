/* FindingsCluster — a SeverityIndicators cluster wired to its FindingsHoverCard:
   HOVER the cluster to preview all findings; CLICK a severity chip to pin the
   card to just that severity (active chip ringed, others dim; click again or
   click outside to clear). The filter state + the (client-side) findings narrow
   live here so the PR list and the PR-detail timeline behave identically. */
"use client";

import React from "react";
import { SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { SeverityIndicators } from "./SeverityIndicators";
import { FindingsHoverCard } from "./FindingsHoverCard";
import { useSeverityFilter } from "./useSeverityFilter";
import type { SeverityCounts } from "./helpers";

export function FindingsCluster({
  counts,
  findings,
  loading = false,
  onOpen,
  titleAll,
  emptyLabel,
  moreLabel,
}: {
  /** Per-severity counts for the always-visible chips (drives the cluster). */
  counts: SeverityCounts;
  /** Open findings the card lists; `undefined` while a lazy fetch is in flight. */
  findings: FindingRecord[] | undefined;
  loading?: boolean;
  /** Fires once on first hover (lazy-fetch trigger), forwarded to the card. */
  onOpen?: () => void;
  /** Card header when NOT filtered, e.g. "4 findings" (i18n'd upstream). */
  titleAll: string;
  emptyLabel: string;
  moreLabel?: (count: number) => string;
}) {
  const { active, toggle, clear, filtered } = useSeverityFilter(findings);
  // When a severity is pinned the header reflects it (the chip already shows the
  // count + the list is narrowed); otherwise the full-count title.
  const title = active ? SEV[active].label : titleAll;
  return (
    <FindingsHoverCard
      title={title}
      findings={filtered}
      loading={loading}
      emptyLabel={emptyLabel}
      moreLabel={moreLabel}
      onOpen={onOpen}
      pinned={active != null}
      onRequestClose={clear}
    >
      <SeverityIndicators counts={counts} active={active} onSelect={toggle} />
    </FindingsHoverCard>
  );
}

export default FindingsCluster;
