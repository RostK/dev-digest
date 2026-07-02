import type { CSSProperties } from "react";

/** Co-located styles for the Agent Editor → Context tab. The row list itself
 *  (search, drag handles, checkboxes, tokens, warning) is the shared
 *  `ContextDocList` — this only styles the tab's own title + hint. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", margin: "4px 0 16px" } satisfies CSSProperties,
} as const;
