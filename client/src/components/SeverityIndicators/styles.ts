import type { CSSProperties } from "react";

/** Co-located styles for the severity indicator cluster + hover card. */
export const s = {
  cluster: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  empty: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
  trigger: {
    display: "inline-flex",
    alignItems: "center",
  } satisfies CSSProperties,
  // Clickable severity chip (filter toggle). The active chip gets an accent ring
  // (boxShadow, so it doesn't shift layout); the rest dim while a filter is on.
  chipClickable: { cursor: "pointer", borderRadius: 6 } satisfies CSSProperties,
  chipActive: {
    borderRadius: 6,
    boxShadow: "0 0 0 1.5px var(--accent)",
  } satisfies CSSProperties,
  chipDimmed: { opacity: 0.4 } satisfies CSSProperties,
  // Fixed + portaled to document.body so the PR-list table's `overflow: hidden`
  // can't clip it; the call site supplies top/left from the trigger's rect.
  card: {
    position: "fixed",
    zIndex: 60,
    width: 320,
    maxHeight: 320,
    overflowY: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 10,
    boxShadow: "var(--shadow-modal)",
    padding: 12,
    animation: "ddpop .12s ease",
  } satisfies CSSProperties,
  cardTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  cardMuted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  cardList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  cardItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
  } satisfies CSSProperties,
  cardItemBody: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    minWidth: 0,
  } satisfies CSSProperties,
  cardItemTitle: {
    fontSize: 13,
    fontWeight: 550,
    color: "var(--text-primary)",
    lineHeight: 1.3,
  } satisfies CSSProperties,
  cardItemMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  cardItemLoc: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  cardMore: {
    marginTop: 10,
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
