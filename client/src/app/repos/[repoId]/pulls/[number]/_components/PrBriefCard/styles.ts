import type { CSSProperties } from "react";

export const s = {
  /** Bordered elevated card, mirroring IntentCard/BlastTab's look on the Overview
   *  grid. Unlike those, this card has no fixed height / scroll region — it grows
   *  with its content (no maxHeight/overflowY set here). */
  card: {
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    borderRadius: 10,
    padding: 18,
  } satisfies CSSProperties,

  scroll: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,

  // ---- top row: verdict / score / cost / findings (from review data) ----
  topRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    paddingBottom: 14,
    marginBottom: 2,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  // ---- risk level: color AND text label together (a11y — never color alone) ----
  riskChip: (color: string, bg: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 10px",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 700,
    color,
    background: bg,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  }),

  what: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.5,
    margin: 0,
  } satisfies CSSProperties,

  why: {
    fontSize: 13,
    fontStyle: "italic",
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    margin: 0,
  } satisfies CSSProperties,

  sectionHeading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,

  /** Inner stack of the Summary card (what / why / risk level), under the top row. */
  section: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,

  // ---- risks list ----
  riskItem: {
    display: "flex",
    flexDirection: "column",
    gap: 3,
    padding: "8px 0",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  riskTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,

  riskTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  riskExplanation: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  // ---- risk file references: deep-links into the Smart Changes diff tab ----
  riskRefs: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 2,
  } satisfies CSSProperties,

  // ---- review focus rows: path:line + reason + blob link ----
  focusItem: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "6px 0",
  } satisfies CSSProperties,

  focusReason: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,

  emptyHint: {
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    margin: "0 0 4px",
  } satisfies CSSProperties,

  emptyWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "flex-start",
  } satisfies CSSProperties,

  footerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  } satisfies CSSProperties,

  generatedAt: {
    fontSize: 11.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
