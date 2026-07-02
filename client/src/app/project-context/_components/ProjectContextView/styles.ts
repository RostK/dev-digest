import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextView (mirrors ConventionsView). */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent)" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  rows: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  path: {
    flex: 1,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  usedBy: { fontSize: 12, color: "var(--text-muted)", minWidth: 120 } satisfies CSSProperties,
  coverage: { display: "flex", alignItems: "center", gap: 8, width: 150 } satisfies CSSProperties,
  coverageBar: { flex: 1 } satisfies CSSProperties,
  coveragePct: {
    fontSize: 12,
    color: "var(--text-secondary)",
    minWidth: 68,
    textAlign: "right",
  } satisfies CSSProperties,
} as const;
