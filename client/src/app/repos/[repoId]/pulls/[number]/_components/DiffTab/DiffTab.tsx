"use client";

import React from "react";
import { useTranslations } from "next-intl";
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
import type { PrFile, Severity } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

type ViewMode = "smart" | "original";

/**
 * Build a per-file, per-line severity map from the latest review per agent.
 * Uses only non-dismissed findings, keeping the most severe value per line.
 */
function buildFindingsBySeverity(reviews: ReturnType<typeof usePrReviews>["data"]): FindingsBySeverity {
  const map: FindingsBySeverity = new Map();
  if (!reviews) return map;

  const latest = latestReviewsPerAgent(reviews);
  for (const review of latest) {
    for (const finding of review.findings) {
      if (finding.dismissed_at) continue;
      const { file, start_line, severity } = finding;
      if (!file || start_line == null) continue;

      if (!map.has(file)) map.set(file, new Map());
      const fileMap = map.get(file)!;

      // Keep most severe per line (CRITICAL > WARNING > SUGGESTION)
      const existing = fileMap.get(start_line);
      if (!existing || severityRank(severity) > severityRank(existing)) {
        fileMap.set(start_line, severity);
      }
    }
  }
  return map;
}

function severityRank(s: Severity): number {
  if (s === "CRITICAL") return 3;
  if (s === "WARNING") return 2;
  return 1;
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

  // Build the per-file severity map once reviews are loaded
  const findingsBySeverity = React.useMemo(
    () => buildFindingsBySeverity(reviews),
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
