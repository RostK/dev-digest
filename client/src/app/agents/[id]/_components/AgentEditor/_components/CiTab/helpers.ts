import type { CiRun } from "@devdigest/shared";

/** Group an agent's CI runs by installation id (a run with no installation —
 *  shouldn't happen post-Sync, but guard it — is dropped rather than crashing
 *  the grouping). */
export function groupRunsByInstallation(runs: CiRun[] | undefined): Map<string, CiRun[]> {
  const map = new Map<string, CiRun[]>();
  for (const run of runs ?? []) {
    if (!run.ci_installation_id) continue;
    const list = map.get(run.ci_installation_id) ?? [];
    list.push(run);
    map.set(run.ci_installation_id, list);
  }
  return map;
}
