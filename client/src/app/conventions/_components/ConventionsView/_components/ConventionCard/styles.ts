import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard. */
export const s = {
  card: (accepted: boolean): CSSProperties => ({
    display: "flex",
    gap: 16,
    padding: 16,
    borderRadius: 10,
    background: "var(--bg-elevated)",
    border: `1px solid ${accepted ? "var(--accent)" : "var(--border)"}`,
    borderLeft: `3px solid ${accepted ? "var(--accent)" : "var(--border)"}`,
  }),
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } satisfies CSSProperties,
  rule: { fontSize: 14, fontWeight: 600, flex: 1, lineHeight: 1.4 } satisfies CSSProperties,
  evidence: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
    textDecoration: "none",
  } satisfies CSSProperties,
  snippet: {
    marginTop: 8,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    fontSize: 12.5,
    lineHeight: 1.5,
    overflowX: "auto",
    whiteSpace: "pre",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  confidenceRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 12 } satisfies CSSProperties,
  confidenceLabel: {
    fontSize: 11,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
  bar: { width: 160 } satisfies CSSProperties,
  pct: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    flexShrink: 0,
    width: 128,
  } satisfies CSSProperties,
} as const;
