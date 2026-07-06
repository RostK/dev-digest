import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "24px 28px 48px",
    maxWidth: 1120,
    margin: "0 auto",
  } satisfies CSSProperties,

  header: {
    marginBottom: 20,
  } satisfies CSSProperties,

  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "var(--text-primary)",
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,

  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 4,
  } satisfies CSSProperties,

  section: {
    marginBottom: 28,
  } satisfies CSSProperties,

  card: {
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    borderRadius: 10,
    overflow: "hidden",
  } satisfies CSSProperties,

  table: {
    width: "100%",
    borderCollapse: "collapse",
  } satisfies CSSProperties,

  theadRow: {
    display: "grid",
    gridTemplateColumns: "2fr 90px 1fr 1fr 1fr 70px 40px",
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
    gridTemplateColumns: "2fr 90px 1fr 1fr 1fr 70px 40px",
    gap: 8,
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
    textDecoration: "none",
    color: "inherit",
  } satisfies CSSProperties,

  rowLast: {
    borderBottom: "none",
  } satisfies CSSProperties,

  agentName: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  metric: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  runsTheadRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 90px 1fr 1fr 1fr 90px",
    gap: 8,
    padding: "10px 16px",
    borderBottom: "1px solid var(--border)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  runsRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 90px 1fr 1fr 1fr 90px",
    gap: 8,
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  loading: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 16,
  } satisfies CSSProperties,
} as const;
