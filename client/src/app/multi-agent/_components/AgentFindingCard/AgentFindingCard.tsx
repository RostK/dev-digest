/* AgentFindingCard — self-contained, prop-driven expandable finding card for
   the Multi-Agent Review results page (T5, AC-13/14/24). NOT the PR page's
   FindingCard (client/INSIGHTS.md 2026-06-24 — wrong dependency direction to
   import a page-feature component here); this is its own leaf component under
   multi-agent/_components so T4 can import it without forking anything.

   Collapsed: severity icon, title, category chip, file:line, confidence %.
   Expanded: rationale + SUGGESTED FIX, then 5 action buttons —
   Accept/Dismiss (via the EXISTING useFindingAction hook, unchanged),
   Turn into eval case (client clipboard only, see eval-case.ts), and
   Learn/Reply to author (rendered but disabled with an accessible
   "coming soon" tooltip). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  Button,
  Markdown,
  SEV,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useFindingAction } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import { lineLabel, tooltipId } from "./helpers";
import { writeEvalCaseToClipboard } from "./eval-case";
import { s } from "./styles";

export interface AgentFindingCardProps {
  /** The full finding record — rationale/suggestion/confidence + accept/dismiss
   *  state, exactly what `useFindingAction` returns on success. */
  finding: FindingRecord;
  /** The agent that produced this finding (attribution, AC-17). Not rendered
   *  in the card itself (the surrounding column/tab already identifies the
   *  agent) — only used to label the generated eval-case template. */
  agentName?: string | null;
  /** Threaded into `useFindingAction` so accept/dismiss invalidate the right
   *  `["reviews", prId]` cache. */
  prId?: string;
  defaultExpanded?: boolean;
}

export function AgentFindingCard({
  finding,
  agentName,
  prId,
  defaultExpanded,
}: AgentFindingCardProps) {
  const t = useTranslations("multiAgentFindings");
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  // This card is self-contained: it can't assume the parent's query is
  // invalidated + re-passes a fresh `finding` prop, so it tracks the
  // accept/dismiss mutation's OWN result locally (AC-14 "reflect the finding's
  // new state").
  const [override, setOverride] = React.useState<Pick<
    FindingRecord,
    "accepted_at" | "dismissed_at"
  > | null>(null);
  const findingAction = useFindingAction();
  const [copyState, setCopyState] = React.useState<"idle" | "copying">("idle");

  const acceptedAt = override?.accepted_at ?? finding.accepted_at;
  const dismissedAt = override?.dismissed_at ?? finding.dismissed_at;
  const accepted = !!acceptedAt;
  const dismissed = !!dismissedAt;
  const muted = accepted || dismissed;
  const sevColor = SEV[finding.severity as Severity]?.c ?? "var(--text-muted)";
  const severityLabel = SEV[finding.severity as Severity]?.label ?? finding.severity;

  function handleAction(action: "accept" | "dismiss") {
    findingAction.mutate(
      { findingId: finding.id, action, prId },
      {
        onSuccess: (data) => {
          setOverride({
            accepted_at: data.finding.accepted_at,
            dismissed_at: data.finding.dismissed_at,
          });
        },
      },
    );
  }

  async function handleEvalCase() {
    setCopyState("copying");
    const ok = await writeEvalCaseToClipboard(finding, { agentName });
    setCopyState("idle");
    if (ok) notify.success(t("evalCase.copied"));
    else notify.error(t("evalCase.copyFailed"));
  }

  const learnTooltipId = tooltipId(finding.id, "learn");
  const replyTooltipId = tooltipId(finding.id, "reply");

  return (
    <div data-finding-id={finding.id} style={s.card(sevColor, muted)}>
      <div
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((exp) => !exp);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        style={s.header}
      >
        <div style={s.badgeWrap}>
          <span title={severityLabel} aria-label={severityLabel}>
            <SeverityBadge severity={finding.severity as Severity} compact />
          </span>
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.title(muted, dismissed)}>{finding.title}</span>
            <CategoryTag category={finding.category as Category} />
            {accepted && <span style={s.acceptedTag}>{t("card.accepted")}</span>}
            {dismissed && <span style={s.dismissedTag}>{t("card.dismissed")}</span>}
          </div>
          <div style={s.metaRow}>
            <span className="mono" style={s.location}>
              {finding.file}:{lineLabel(finding)}
            </span>
            <ConfidenceNum value={finding.confidence} />
          </div>
        </div>
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.prose}>
            <Markdown>{finding.rationale}</Markdown>
          </div>
          {finding.suggestion && (
            <div style={s.suggestionWrap}>
              <div style={s.suggestionLabel}>{t("card.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{finding.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={findingAction.isPending}
              active={accepted}
              onClick={() => handleAction("accept")}
            >
              {t("card.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={findingAction.isPending}
              active={dismissed}
              onClick={() => handleAction("dismiss")}
            >
              {t("card.dismiss")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="Copy"
              loading={copyState === "copying"}
              onClick={() => void handleEvalCase()}
            >
              {t("card.turnIntoEvalCase")}
            </Button>

            <span style={s.actionWrap}>
              <Button
                kind="ghost"
                size="sm"
                icon="Brain"
                disabled
                title={t("card.comingSoon")}
                aria-describedby={learnTooltipId}
              >
                {t("card.learn")}
              </Button>
              <span id={learnTooltipId} style={s.visuallyHidden}>
                {t("card.comingSoon")}
              </span>
            </span>

            <span style={s.actionWrap}>
              <Button
                kind="ghost"
                size="sm"
                icon="MessageSquare"
                disabled
                title={t("card.comingSoon")}
                aria-describedby={replyTooltipId}
              >
                {t("card.replyToAuthor")}
              </Button>
              <span id={replyTooltipId} style={s.visuallyHidden}>
                {t("card.comingSoon")}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
