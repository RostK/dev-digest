import type { useTranslations } from "next-intl";
import type { AgentEstimate } from "@devdigest/shared";

/**
 * Per-agent estimate label for a picker row (AC-1/AC-6): `~Ns` for an agent
 * with usable history, or the `noHistory` literal — NEVER a fabricated number.
 */
export function estimateLabel(
  t: ReturnType<typeof useTranslations>,
  est: AgentEstimate | undefined,
): string {
  if (!est?.has_history || est.duration_ms == null) return t("picker.noHistory");
  const seconds = Math.max(1, Math.round(est.duration_ms / 1000));
  return t("picker.estimate", { seconds });
}
