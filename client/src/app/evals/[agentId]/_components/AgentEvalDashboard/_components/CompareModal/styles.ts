import type { CSSProperties } from "react";

export const s = {
  body: {
    padding: "18px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  } satisfies CSSProperties,

  metaRow: {
    display: "flex",
    gap: 24,
  } satisfies CSSProperties,

  metaCol: {
    flex: 1,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  metaValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    marginTop: 2,
  } satisfies CSSProperties,

  deltaTable: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,

  deltaHeadRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
    gap: 8,
    padding: "8px 14px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  deltaRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
    gap: 8,
    alignItems: "center",
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  deltaRowLast: {
    borderBottom: "none",
  } satisfies CSSProperties,

  metricLabel: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  metricValue: {
    fontSize: 13,
    fontFamily: "var(--font-mono)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  deltaCell: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12.5,
    fontWeight: 600,
    color,
  }),

  promptsHeading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,

  promptGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
  } satisfies CSSProperties,

  promptCol: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    minWidth: 0,
  } satisfies CSSProperties,

  promptLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  promptBox: {
    margin: 0,
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 320,
    overflow: "auto",
  } satisfies CSSProperties,

  loading: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
} as const;
