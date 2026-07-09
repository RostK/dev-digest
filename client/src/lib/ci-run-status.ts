import type { useTranslations } from "next-intl";

/* ci-run-status.ts — maps a `CiRun.status` string to a display label. Shared
   by the CI tab + the CI Runs page (2nd use). `CiRun.status` is a plain
   `z.string()` in the contract (not the `CiRunStatus` enum), so an unrecognized
   value must NOT be handed to `t()` — next-intl THROWS on a missing key
   (client/INSIGHTS.md:48), which would take down the whole runs list. Only the
   four known statuses resolve through i18n; anything else renders verbatim. */

type Translator = ReturnType<typeof useTranslations>;

const KNOWN_STATUS_KEYS = new Set(["succeeded", "failed", "running", "noFindings"]);

/** `no_findings` (server enum, snake_case) → `noFindings` (message key, camelCase). */
function toMessageKey(status: string): string {
  return status === "no_findings" ? "noFindings" : status;
}

/** Resolve a `CiRun.status` to its localized label, falling back to the raw
 *  value for anything outside the known `CiRunStatus` set. */
export function ciRunStatusLabel(status: string | null | undefined, t: Translator): string {
  if (!status) return "—";
  const key = toMessageKey(status);
  return KNOWN_STATUS_KEYS.has(key) ? t(`runs.status.${key}`) : status;
}
