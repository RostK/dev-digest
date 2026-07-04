"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastTab } from "../BlastTab";
import { PrBriefCard } from "../PrBriefCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string;
  /** owner/repo + head sha — let the Blast section deep-link callers to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha }: OverviewTabProps) {
  return (
    <>
      <PrBriefCard prId={prId} />

      {/* Intent (left) + Blast radius (right), mirroring the PR-brief design. */}
      <div style={s.brief}>
        <IntentCard prId={prId} />
        <BlastTab prId={prId} repoFullName={repoFullName} headSha={headSha} />
      </div>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
