/** Pure helpers for the DiffViewer. */
import { HUNK_HEADER_RE } from "./constants";

/** Stable DOM id for a file's card, so a deep-link (?tab=diff&file=…) can scroll
 *  to it. Paths are used verbatim (getElementById accepts any non-space string,
 *  and diff paths carry none). */
export function fileAnchorId(path: string): string {
  return `diff-file-${path}`;
}

/** `scroll-margin-top` for scroll-into-view targets in the diff (file cards,
 *  finding lines). The PR detail header is `position: sticky; top: 0`, so a bare
 *  scrollIntoView aligns the target to y=0 UNDER it. PrDetailHeader publishes its
 *  live height as `--pr-detail-header-h`; we clear that plus a small gap so the
 *  target lands just below the sticky panel instead of behind it. */
export const DIFF_SCROLL_MARGIN_TOP = "calc(var(--pr-detail-header-h, 140px) + 12px)";

export interface Line {
  kind: "add" | "del" | "ctx" | "hunk";
  text: string;
  oldNo?: number;
  newNo?: number;
}

/** Parse unified-diff patch text into renderable lines with old/new line numbers. */
export function parsePatch(patch: string | null | undefined): Line[] {
  if (!patch) return [];
  const out: Line[] = [];
  let oldNo = 0;
  let newNo = 0;
  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) {
        oldNo = parseInt(m[1]!, 10);
        newNo = parseInt(m[2]!, 10);
      }
      out.push({ kind: "hunk", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", text: raw.slice(1), newNo });
      newNo++;
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", text: raw.slice(1), oldNo });
      oldNo++;
    } else {
      out.push({ kind: "ctx", text: raw.slice(raw.startsWith(" ") ? 1 : 0), oldNo, newNo });
      oldNo++;
      newNo++;
    }
  }
  return out;
}
