import type { CSSProperties } from "react";

export const s = {
  page: {
    padding: "24px 28px 48px",
    maxWidth: 1120,
    margin: "0 auto",
  } satisfies CSSProperties,

  backLink: {
    fontSize: 13,
    color: "var(--text-secondary)",
    textDecoration: "none",
    display: "inline-block",
    marginBottom: 10,
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

  alertBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    marginBottom: 18,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  metricRow: {
    display: "flex",
    gap: 14,
    marginBottom: 24,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  section: {
    marginBottom: 28,
  } satisfies CSSProperties,

  card: {
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    borderRadius: 10,
    padding: 18,
  } satisfies CSSProperties,

  legendRow: {
    display: "flex",
    gap: 16,
    marginBottom: 10,
  } satisfies CSSProperties,

  legendItem: (): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
  }),

  legendDot: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 99,
    background: color,
  }),

  tableCard: {
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    borderRadius: 10,
    overflow: "hidden",
  } satisfies CSSProperties,

  compareBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  } satisfies CSSProperties,

  theadRow: {
    display: "grid",
    gridTemplateColumns: "36px 1.3fr 90px 1fr 1fr 1fr 70px 90px",
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
    gridTemplateColumns: "36px 1.3fr 90px 1fr 1fr 1fr 70px 90px",
    gap: 8,
    alignItems: "center",
    padding: "12px 16px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  rowLast: {
    borderBottom: "none",
  } satisfies CSSProperties,

  metric: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  passBadgeWrap: {
    display: "flex",
  } satisfies CSSProperties,

  loading: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 16,
  } satisfies CSSProperties,
} as const;
