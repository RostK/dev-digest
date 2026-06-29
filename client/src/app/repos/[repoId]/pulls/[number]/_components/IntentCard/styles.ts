import type { CSSProperties } from "react";

/** Co-located styles for IntentCard — bordered elevated card, mirroring VerdictBanner. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    borderRadius: 10,
    padding: 18,
    height: "min(560px, 72vh)",
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  /** Scrollable body below the fixed section header. */
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    paddingRight: 4,
  } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    fontStyle: "italic",
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    marginBottom: 16,
  } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  } satisfies CSSProperties,
  scopeCol: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  scopeHeading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    marginBottom: 4,
  } satisfies CSSProperties,
  scopeItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  scopeIcon: {
    flexShrink: 0,
    marginTop: 1,
  } satisfies CSSProperties,
  footer: {
    marginTop: 16,
    display: "flex",
    justifyContent: "flex-end",
  } satisfies CSSProperties,
  emptyHint: {
    fontSize: 13,
    color: "var(--text-muted)",
    marginTop: 6,
  } satisfies CSSProperties,
} as const;
