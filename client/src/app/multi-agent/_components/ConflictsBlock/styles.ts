import type { CSSProperties } from "react";

/** Co-located styles for ConflictsBlock — design tokens only, no Tailwind
 *  utilities (client/CLAUDE.md). */
export const s = {
  section: {
    marginTop: 24,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  heading: {
    fontSize: 16,
    fontWeight: 650,
    color: "var(--text-primary)",
    margin: 0,
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  groupList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 14,
  } satisfies CSSProperties,
  cardHeader: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  location: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  takes: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 10,
  } satisfies CSSProperties,
  takeCell: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: 10,
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
  takeHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  } satisfies CSSProperties,
  agentName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  didNotFlag: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  } satisfies CSSProperties,
  note: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,
} as const;
