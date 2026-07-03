"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { SectionLabel, Button } from "@devdigest/ui";
import {
  DiffViewer,
  SmartDiffViewer,
  type DiffCommentApi,
} from "@/components/diff-viewer";
import type { FindingsBySeverity } from "@/components/diff-viewer/SmartDiffViewer/SmartDiffViewer";
import {
  usePrComments,
  useCreatePrComment,
  usePrSmartDiff,
  usePrReviews,
} from "@/lib/hooks/reviews";
import { latestReviewsPerAgent } from "@/components/SeverityIndicators/helpers";
import { notify } from "@/lib/toast";
import type { PrFile, FindingRecord } from "@devdigest/shared";

/** Scroll to the ?file=&line= target once, when both params are present —
 *  prefers the highlighted-line anchor (`sd-{file}-L{line}`), falling back to
 *  the file-level anchor (`diff-file-{file}`) when that line isn't a
 *  highlighted finding line (or the file is collapsed in smart mode). Reused
 *  by both DiffTab render branches (Smart/Original) since file+line params
 *  don't depend on which viewer is active. */
function useScrollToDiffFocus(files: PrFile[]) {
  const search = useSearchParams();
  const file = search.get("file");
  const lineParam = search.get("line");
  const line = lineParam != null ? Number(lineParam) : null;

  React.useEffect(() => {
    if (!file || line == null || Number.isNaN(line)) return;

    const frame = requestAnimationFrame(() => {
      const lineId = `sd-${file}-L${line}`;
      const fileId = `diff-file-${file}`;
      const target = document.getElementById(lineId) ?? document.getElementById(fileId);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
    // Re-run if the target changes or the file list (re)renders (e.g. after
    // the smart-diff/original data loads and files mount).
  }, [file, line, files]);
}

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

type ViewMode = "smart" | "original";

/**
 * Build a per-file map of FindingRecord[] from the latest review per agent.
 * Uses only non-dismissed findings. The full records are passed down so
 * clicking a severity badge can reveal inline finding details (InlineFinding).
 */
function buildFindingsByPath(reviews: ReturnType<typeof usePrReviews>["data"]): FindingsBySeverity {
  const map: FindingsBySeverity = new Map();
  if (!reviews) return map;

  const latest = latestReviewsPerAgent(reviews);
  for (const review of latest) {
    for (const finding of review.findings) {
      if (finding.dismissed_at) continue;
      const { file, start_line } = finding;
      if (!file || start_line == null) continue;

      if (!map.has(file)) map.set(file, []);
      map.get(file)!.push(finding as FindingRecord);
    }
  }
  return map;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = usePrSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);

  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<ViewMode>("smart");

  // Deep-link support: PrBriefCard's review-focus rows link here with
  // ?file=&line=, so scroll to that file/line once the diff renders.
  useScrollToDiffFocus(files);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  // Build the per-file findings map once reviews are loaded
  const findingsBySeverity = React.useMemo(
    () => buildFindingsByPath(reviews),
    [reviews],
  );

  const isSmartMode = viewMode === "smart" && !!smartDiff;
  const sectionTitle = isSmartMode
    ? t("smartDiff.reviewerOrdered")
    : `Files changed · ${filesCount} files`;

  const right = (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {/* Smart / Original order toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Button
          kind={viewMode === "smart" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setViewMode("smart")}
          aria-pressed={viewMode === "smart"}
        >
          {t("smartDiff.smartOrder")}
        </Button>
        <Button
          kind={viewMode === "original" ? "primary" : "ghost"}
          size="sm"
          onClick={() => setViewMode("original")}
          aria-pressed={viewMode === "original"}
        >
          {t("smartDiff.originalOrder")}
        </Button>
      </div>
      {/* Comment visibility toggle */}
      {commentCount > 0 && (
        <Button
          kind="ghost"
          size="sm"
          icon={showComments ? "EyeOff" : "Eye"}
          onClick={() => setShowComments((v) => !v)}
        >
          {showComments ? "Hide comments" : "Show comments"} ({commentCount})
        </Button>
      )}
    </div>
  );

  return (
    <section>
      <SectionLabel icon="Code" right={right}>
        {sectionTitle}
      </SectionLabel>
      {isSmartMode ? (
        <SmartDiffViewer
          files={files}
          smartDiff={smartDiff}
          commenting={commenting}
          findingsBySeverity={findingsBySeverity}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
