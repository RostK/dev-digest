import type { Onboarding, OnboardingSection, OnboardingJobStatus } from "@devdigest/shared";
import { SECTION_DEFS, ACTIVE_JOB_STATUSES, type SectionDef } from "./constants";

export function isJobActive(status: OnboardingJobStatus["status"] | null | undefined): boolean {
  return !!status && ACTIVE_JOB_STATUSES.has(status);
}

export interface OrderedSection {
  def: SectionDef;
  section: OnboardingSection;
}

/** Reorder a tour's sections to the canonical five (see constants.ts) rather
 *  than trusting API array order; a kind missing from the response is skipped
 *  defensively instead of crashing the page. */
export function orderedSections(tour: Onboarding | null | undefined): OrderedSection[] {
  if (!tour) return [];
  const byKind = new Map(tour.sections.map((section) => [section.kind, section] as const));
  const out: OrderedSection[] = [];
  for (const def of SECTION_DEFS) {
    const section = byKind.get(def.kind);
    if (section) out.push({ def, section });
  }
  return out;
}

/** Split a "how to run" section body into discrete, numbered, copyable steps
 *  — one per non-blank line, stripping a leading list marker (`1.`/`-`/`*`)
 *  and wrapping backticks. Robust to whichever list style the model used
 *  (the contract only carries a single markdown `body`, not a structured
 *  steps array) — AC-13. */
export function parseSteps(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) =>
      line
        .replace(/^(\d+[.)]|[-*])\s+/, "")
        .replace(/^`+|`+$/g, "")
        .trim(),
    )
    .filter((line) => line.length > 0);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Localized relative-time phrase ("2 hours ago") via the standard Intl API —
 *  the OUTPUT is platform-localized, so it deliberately doesn't go through an
 *  i18n key (there's no way to key an open-ended parametrized time phrase;
 *  this is the same reasoning that lets toLocaleString()-style formatting
 *  skip next-intl elsewhere). Empty string for an unparsable/missing
 *  timestamp — the caller supplies its own fallback copy. */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffMs = then - now;
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < MINUTE_MS) return rtf.format(0, "second");
  if (abs < HOUR_MS) return rtf.format(Math.round(diffMs / MINUTE_MS), "minute");
  if (abs < DAY_MS) return rtf.format(Math.round(diffMs / HOUR_MS), "hour");
  return rtf.format(Math.round(diffMs / DAY_MS), "day");
}

/** Best-effort clipboard copy (AC-21 share link, AC-13 per-step copy) —
 *  optional-chained since jsdom/older browsers may not implement it. */
export function copyToClipboard(text: string): void {
  void navigator.clipboard?.writeText(text);
}
