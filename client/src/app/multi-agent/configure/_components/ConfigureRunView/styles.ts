import type { CSSProperties } from "react";

/** Co-located styles for ConfigureRunView (mirrors ProjectContextView). */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 900, margin: "0 auto" } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 24 } satisfies CSSProperties,
  section: { marginBottom: 28 } satisfies CSSProperties,
  stepHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  } satisfies CSSProperties,
  stepLabel: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  selectAll: {
    border: "none",
    background: "transparent",
    color: "var(--accent)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  } satisfies CSSProperties,
  cards: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  card: { padding: "12px 14px" } satisfies CSSProperties,
  cardBody: { display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 } satisfies CSSProperties,
  cardTopRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  } satisfies CSSProperties,
  cardName: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  cardSummary: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  cardEstimate: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    paddingTop: 6,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  summary: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
