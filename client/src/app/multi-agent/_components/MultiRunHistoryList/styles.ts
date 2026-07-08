import type { CSSProperties } from "react";

/** Co-located styles for MultiRunHistoryList (mirrors ConfigureRunView). */
export const s = {
  section: {
    marginTop: 8,
    paddingTop: 20,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  } satisfies CSSProperties,
  heading: { fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 4, listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    padding: "9px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  date: { fontSize: 13, color: "var(--text-primary)" } satisfies CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
