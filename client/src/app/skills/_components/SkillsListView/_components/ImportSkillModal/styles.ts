import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillModal. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24 } satisfies CSSProperties,
  trust: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 16,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  fileInput: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)", marginTop: 8 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  warn: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontSize: 13,
    color: "var(--warn)",
    margin: "4px 0",
  } satisfies CSSProperties,
  ignored: { display: "flex", flexWrap: "wrap", gap: 6 } satisfies CSSProperties,
} as const;
