/** Format a 0–1 ratio (recall / precision / citation accuracy) as a whole-percent
 *  string, e.g. `0.833 → "83%"`. Shared by the eval dashboards and compare modal. */
export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
