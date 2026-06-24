"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, SmartDiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrSmartDiff } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

type ViewMode = "smart" | "original";

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = usePrSmartDiff(prId);
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
        <SmartDiffViewer files={files} smartDiff={smartDiff} commenting={commenting} />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
