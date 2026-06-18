"use client";

import { useState } from "react";
import type { Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";

/**
 * Click-to-filter state for a severity cluster + its findings card. Clicking a
 * severity chip pins the card to that severity; clicking the same chip again
 * clears it (back to hover-shows-all). `filtered` narrows the findings to the
 * active severity, or returns the full list (incl. `undefined` while loading)
 * when none is active. Shared by the PR list and the PR-detail timeline so the
 * interaction is identical on both.
 */
export function useSeverityFilter(findings: FindingRecord[] | undefined) {
  const [active, setActive] = useState<Severity | null>(null);
  const toggle = (sev: Severity) => setActive((cur) => (cur === sev ? null : sev));
  const clear = () => setActive(null);
  const filtered = active ? findings?.filter((f) => f.severity === active) : findings;
  return { active, toggle, clear, filtered };
}
