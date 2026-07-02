import type { IconName } from "@devdigest/ui";
import type { OnboardingJobStatus } from "@devdigest/shared";

export interface SectionDef {
  /** Matches OnboardingSection.kind, normalized server-side (see
   *  onboarding/facts.ts normalizeToCanonicalFive). */
  kind: string;
  /** DOM id the "on this page" anchors + the section card both use. */
  id: string;
  /** Fallback title (only used if the section arrives with an empty title). */
  titleKey: string;
  icon: IconName;
}

/** Canonical section order (AC-3). The client derives ITS OWN order from this
 *  list rather than trusting response array order, so a server-side ordering
 *  regression can't silently reorder/drop a card — see helpers.ts
 *  orderedSections. Kind slugs mirror server/src/prompts/onboarding.system.md
 *  + the module's constants.ts (kept in sync by convention, not by import —
 *  the module boundary is the dual-vendored @devdigest/shared contract, not
 *  cross-package constant sharing). */
export const SECTION_DEFS: SectionDef[] = [
  { kind: "architecture", id: "architecture", titleKey: "sections.architecture.title", icon: "Boxes" },
  { kind: "critical_paths", id: "critical_paths", titleKey: "sections.criticalPaths.title", icon: "Target" },
  { kind: "how_to_run", id: "how_to_run", titleKey: "sections.howToRun.title", icon: "Play" },
  { kind: "reading_path", id: "reading_path", titleKey: "sections.readingPath.title", icon: "Workflow" },
  { kind: "first_tasks", id: "first_tasks", titleKey: "sections.firstTasks.title", icon: "ListChecks" },
];

export const ACTIVE_JOB_STATUSES = new Set<OnboardingJobStatus["status"]>(["queued", "running"]);
