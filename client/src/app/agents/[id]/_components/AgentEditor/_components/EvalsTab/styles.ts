import type { CSSProperties } from "react";

/** Co-located styles for the Agent Editor -> Evals tab (T8). Mirrors the
 *  eval-dashboard's table-as-grid pattern (see app/evals/[agentId]) at a
 *  smaller, tab-embedded scale. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  } satisfies CSSProperties,
  headerLeft: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  hint: {
    fontSize: 13,
    color: "var(--text-secondary)",
    margin: "10px 0",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  summary: {
    fontSize: 13,
    color: "var(--text-muted)",
    margin: "4px 0 16px",
  } satisfies CSSProperties,
  tableCard: {
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    borderRadius: 10,
    overflow: "hidden",
  } satisfies CSSProperties,
  theadRow: {
    display: "grid",
    gridTemplateColumns: "1.6fr 110px 90px 90px",
    gap: 8,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: "1.6fr 110px 90px 90px",
    gap: 8,
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  rowLast: { borderBottom: "none" } satisfies CSSProperties,
  caseName: { fontSize: 13, color: "var(--text-primary)", fontWeight: 500 } satisfies CSSProperties,
  metric: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", marginTop: 14 } satisfies CSSProperties,
  viewDashboardLink: {
    fontSize: 13,
    color: "var(--accent)",
    textDecoration: "none",
    fontWeight: 500,
  } satisfies CSSProperties,
} as const;
