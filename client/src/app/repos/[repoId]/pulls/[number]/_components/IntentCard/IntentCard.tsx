"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { usePrIntent, useRecomputeIntent } from "@/lib/hooks";
import { s } from "./styles";

interface IntentCardProps {
  prId: string;
}

export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations("intent");
  const { data: intent, isPending } = usePrIntent(prId);
  const recompute = useRecomputeIntent(prId);

  // Lazy auto-compute: fire exactly once when the query resolves to null and
  // no recompute is already in progress or has already succeeded this mount.
  const autoFired = React.useRef(false);
  React.useEffect(() => {
    if (
      !isPending &&
      intent === null &&
      !autoFired.current &&
      !recompute.isPending &&
      !recompute.isSuccess
    ) {
      autoFired.current = true;
      recompute.mutate();
    }
  }, [isPending, intent, recompute]);

  const isComputing = isPending || recompute.isPending;

  return (
    <div style={s.card}>
      <SectionLabel
        icon="Target"
        right={
          intent != null ? (
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              disabled={recompute.isPending}
              loading={recompute.isPending}
              onClick={() => recompute.mutate()}
            >
              {t("recompute")}
            </Button>
          ) : undefined
        }
      >
        {t("title")}
      </SectionLabel>

      <div style={s.scroll}>
      {isComputing && (
        <p style={s.emptyHint}>{t("computing")}</p>
      )}

      {!isComputing && intent == null && (
        <>
          <p style={s.emptyHint}>{t("empty")}</p>
          <p style={s.emptyHint}>{t("emptyHint")}</p>
        </>
      )}

      {!isComputing && intent != null && (
        <>
          <p style={s.summary}>{intent.intent}</p>
          <div style={s.scopeGrid}>
            {/* In scope */}
            <div style={s.scopeCol}>
              <div style={{ ...s.scopeHeading, color: "var(--ok)" }}>
                {t("inScope")}
              </div>
              {intent.in_scope.map((item, i) => (
                <div key={i} style={s.scopeItem}>
                  <span style={{ ...s.scopeIcon, color: "var(--ok)" }}>✓</span>
                  <span style={{ color: "var(--text-secondary)" }}>{item}</span>
                </div>
              ))}
            </div>

            {/* Out of scope */}
            <div style={s.scopeCol}>
              <div style={{ ...s.scopeHeading, color: "var(--text-muted)" }}>
                {t("outOfScope")}
              </div>
              {intent.out_of_scope.map((item, i) => (
                <div key={i} style={s.scopeItem}>
                  <span style={{ ...s.scopeIcon, color: "var(--text-muted)" }}>✕</span>
                  <span style={{ color: "var(--text-muted)" }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recompute button also appears in footer only when no header button is visible */}
        </>
      )}
      </div>
    </div>
  );
}
