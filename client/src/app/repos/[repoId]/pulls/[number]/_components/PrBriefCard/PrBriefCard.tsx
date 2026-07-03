/* PrBriefCard — PR Why+Risk Brief (SPEC-04). Top row is composed live from the
   PR's review data (verdict/score/cost/findings), NOT from the Brief — a review
   can exist without a brief and vice versa. The body is a pure read of
   useBrief: null shows an explicit Generate button (no auto-fire, AC-7); a
   present brief renders what/why, a color+label risk level (AC-9), risks, and
   review-focus rows linking out to GitHub (AC-12), plus Regenerate (AC-6). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, SectionLabel, MonoLink, Icon } from "@devdigest/ui";
import type { Brief, Risk, ReviewFocus } from "@devdigest/shared";
import { useBrief, useGenerateBrief } from "@/lib/hooks";
import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { latestReviewsPerAgent } from "@/components/SeverityIndicators";
import { githubBlobUrl } from "@/lib/github-urls";
import { RISK_COLOR, relativeTimeAgo } from "./helpers";
import { s } from "./styles";

type T = ReturnType<typeof useTranslations>;

interface PrBriefCardProps {
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}

export function PrBriefCard({ prId, repoFullName, headSha }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const { data: brief, isPending } = useBrief(prId);
  const generate = useGenerateBrief(prId);

  const { data: reviews } = usePrReviews(prId);
  const { data: runs } = usePrRuns(prId);

  return (
    <div style={s.card}>
      <SectionLabel
        icon="FileText"
        right={
          brief != null ? (
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              disabled={generate.isPending}
              loading={generate.isPending}
              onClick={() => generate.mutate()}
            >
              {t("regenerate")}
            </Button>
          ) : undefined
        }
      >
        {t("title")}
      </SectionLabel>

      <div style={s.scroll}>
        <TopRow reviews={reviews} runs={runs} t={t} />

        {!isPending && brief == null && (
          <EmptyBody generate={() => generate.mutate()} pending={generate.isPending} t={t} />
        )}

        {brief != null && (
          <BriefBody brief={brief} repoFullName={repoFullName} headSha={headSha} t={t} />
        )}
      </div>
    </div>
  );
}

/** Verdict/score/cost/findings from the PR's latest-per-agent reviews — NOT
 *  the Brief. Renders neutral/empty text when no review exists yet. */
function TopRow({
  reviews,
  runs,
  t,
}: {
  reviews: ReturnType<typeof usePrReviews>["data"];
  runs: ReturnType<typeof usePrRuns>["data"];
  t: T;
}) {
  const latest = latestReviewsPerAgent(reviews ?? []);
  const findingsCount = latest.reduce((n, r) => n + r.findings.filter((f) => !f.dismissed_at).length, 0);
  const runById = new Map((runs ?? []).map((r) => [r.run_id, r]));
  // Prefer the most recently created review with a verdict/score for the badges.
  const primary = [...latest].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const run = primary?.run_id ? runById.get(primary.run_id) ?? null : null;

  if (!primary) {
    return (
      <div style={s.topRow}>
        <Badge color="var(--text-muted)">{t("noReview")}</Badge>
      </div>
    );
  }

  return (
    <div style={s.topRow}>
      {primary.verdict && (
        <Badge color="var(--text-secondary)">{t(`verdict.${primary.verdict}`)}</Badge>
      )}
      {primary.score != null && <Badge icon="Target">{t("score", { value: primary.score })}</Badge>}
      <Badge icon="DollarSign">
        {run?.cost_usd != null ? t("cost", { value: run.cost_usd.toFixed(4) }) : t("costUnknown")}
      </Badge>
      <Badge icon="AlertTriangle">{t("findings", { count: findingsCount })}</Badge>
    </div>
  );
}

function EmptyBody({
  generate,
  pending,
  t,
}: {
  generate: () => void;
  pending: boolean;
  t: T;
}) {
  return (
    <div style={s.emptyWrap}>
      <p style={s.emptyHint}>{t("empty")}</p>
      <p style={s.emptyHint}>{t("emptyHint")}</p>
      <Button kind="primary" size="sm" icon="Sparkles" loading={pending} disabled={pending} onClick={generate}>
        {t("generate")}
      </Button>
    </div>
  );
}

function BriefBody({
  brief,
  repoFullName,
  headSha,
  t,
}: {
  brief: Brief;
  repoFullName?: string | null;
  headSha?: string | null;
  t: T;
}) {
  const canLink = !!(repoFullName && headSha);
  const risk = RISK_COLOR[brief.risk_level];
  const generatedAgo = relativeTimeAgo(brief.generated_at);

  return (
    <>
      <div>
        <div style={s.sectionHeading}>{t("what")}</div>
        <p style={s.what}>{brief.what}</p>
      </div>

      <div>
        <div style={s.sectionHeading}>{t("why")}</div>
        <p style={s.why}>{brief.why}</p>
      </div>

      <div>
        <div style={s.sectionHeading}>{t("riskLevel")}</div>
        <span style={s.riskChip(risk.color, risk.bg)}>
          <Icon.AlertTriangle size={12} />
          {t(`risk.${brief.risk_level}`)}
        </span>
      </div>

      <div>
        <div style={s.sectionHeading}>{t("risks")}</div>
        {brief.risks.length === 0 && <p style={s.emptyHint}>{t("noRisks")}</p>}
        {brief.risks.map((r, i) => (
          <RiskRow key={`${r.title}:${i}`} risk={r} t={t} />
        ))}
      </div>

      <div>
        <div style={s.sectionHeading}>{t("reviewFocus")}</div>
        {brief.review_focus.length === 0 && <p style={s.emptyHint}>{t("noFocus")}</p>}
        {brief.review_focus.map((f, i) => (
          <FocusRow
            key={`${f.path}:${f.line}:${i}`}
            focus={f}
            href={canLink ? githubBlobUrl(repoFullName!, headSha!, f.path, f.line) : undefined}
          />
        ))}
      </div>

      {generatedAgo && (
        <div style={s.footerRow}>
          <span style={s.generatedAt}>{t("generatedAt", { relative: generatedAgo })}</span>
        </div>
      )}
    </>
  );
}

function RiskRow({ risk, t }: { risk: Risk; t: T }) {
  const c = RISK_COLOR[risk.severity];
  return (
    <div style={s.riskItem}>
      <div style={s.riskTitleRow}>
        <span style={s.riskChip(c.color, c.bg)}>{t(`risk.${risk.severity}`)}</span>
        <span style={s.riskTitle}>{risk.title}</span>
      </div>
      <p style={s.riskExplanation}>{risk.explanation}</p>
    </div>
  );
}

function FocusRow({ focus, href }: { focus: ReviewFocus; href?: string }) {
  return (
    <div style={s.focusItem}>
      <MonoLink href={href}>
        {focus.path}:{focus.line}
      </MonoLink>
      <p style={s.focusReason}>{focus.reason}</p>
    </div>
  );
}
