/* Sections — the collapsible section card (default open — this is a linear
   "tour", not a drill-down list) + the per-kind body renderer. Architecture
   reuses the shared Markdown primitive + MermaidDiagram (AC-10/AC-11 are
   REUSE, not rebuilt here); Critical paths / Guided reading path render
   OnboardingLink rows (rationale + deterministic used_by + an Open link via
   the same MonoLink + githubBlobUrl pattern as FindingCard/BlastTab); How to
   run splits the section body into numbered, copyable steps (the contract
   only carries a markdown `body`, not a structured steps array — AC-13);
   First tasks renders its body as a markdown list. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, IconBtn, Markdown, MonoLink } from "@devdigest/ui";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import type { OnboardingLink, OnboardingSection } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import type { SectionDef } from "./constants";
import { copyToClipboard, parseSteps } from "./helpers";
import { s } from "./styles";

type T = ReturnType<typeof useTranslations>;

export function SectionCard({
  def,
  section,
  repoFullName,
  defaultBranch,
}: {
  def: SectionDef;
  section: OnboardingSection;
  repoFullName: string | null;
  defaultBranch: string | null;
}) {
  const t = useTranslations("onboarding");
  const [open, setOpen] = React.useState(true);
  const title = section.title || t(def.titleKey);
  const SectionIcon = Icon[def.icon];

  return (
    <div id={def.id} style={s.card}>
      <button
        type="button"
        style={s.cardHeader}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`${def.id}-body`}
      >
        <SectionIcon size={15} style={{ color: "var(--accent-text)", flexShrink: 0 }} />
        <span style={s.cardTitle}>{title}</span>
        <Icon.ChevronDown size={15} style={s.chevron(open)} />
      </button>

      {open && (
        <div id={`${def.id}-body`} style={s.cardBody}>
          <SectionBody def={def} section={section} repoFullName={repoFullName} defaultBranch={defaultBranch} t={t} />
        </div>
      )}
    </div>
  );
}

function SectionBody({
  def,
  section,
  repoFullName,
  defaultBranch,
  t,
}: {
  def: SectionDef;
  section: OnboardingSection;
  repoFullName: string | null;
  defaultBranch: string | null;
  t: T;
}) {
  switch (def.kind) {
    case "architecture":
      return <ArchitectureBody section={section} />;
    case "critical_paths":
      return (
        <LinksBody
          section={section}
          repoFullName={repoFullName}
          defaultBranch={defaultBranch}
          t={t}
          variant="criticalPaths"
        />
      );
    case "how_to_run":
      return <HowToRunBody section={section} t={t} />;
    case "reading_path":
      return (
        <LinksBody
          section={section}
          repoFullName={repoFullName}
          defaultBranch={defaultBranch}
          t={t}
          variant="readingPath"
          numbered
        />
      );
    case "first_tasks":
      return <FirstTasksBody section={section} t={t} />;
    default:
      return <Markdown>{section.body}</Markdown>;
  }
}

function ArchitectureBody({ section }: { section: OnboardingSection }) {
  return (
    <>
      <Markdown>{section.body}</Markdown>
      {section.diagram && <MermaidDiagram chart={section.diagram} />}
    </>
  );
}

type LinksVariant = "criticalPaths" | "readingPath";

function LinksBody({
  section,
  repoFullName,
  defaultBranch,
  t,
  variant,
  numbered,
}: {
  section: OnboardingSection;
  repoFullName: string | null;
  defaultBranch: string | null;
  t: T;
  variant: LinksVariant;
  numbered?: boolean;
}) {
  if (section.links.length === 0) {
    return <p style={s.emptyBody}>{t(`sections.${variant}.empty`)}</p>;
  }
  const canLink = !!(repoFullName && defaultBranch);
  return (
    <div role="list">
      {section.links.map((link, i) => (
        <LinkRow
          key={`${link.path}:${i}`}
          link={link}
          index={numbered ? i + 1 : undefined}
          href={canLink ? githubBlobUrl(repoFullName!, defaultBranch!, link.path) : undefined}
          t={t}
          variant={variant}
        />
      ))}
    </div>
  );
}

function LinkRow({
  link,
  index,
  href,
  t,
  variant,
}: {
  link: OnboardingLink;
  index?: number;
  href?: string;
  t: T;
  variant: LinksVariant;
}) {
  return (
    <div role="listitem" style={s.linkRow}>
      <div style={s.linkRowHead}>
        {index != null && <span style={s.linkIndex}>{index}.</span>}
        <span style={s.linkLabel}>{link.label}</span>
        <span className="mono" style={s.linkPath}>
          {link.path}
        </span>
        {href && <MonoLink href={href}>{t(`sections.${variant}.open`)}</MonoLink>}
        {variant === "criticalPaths" && link.used_by != null && (
          <span style={s.linkUsedBy}>{t("sections.criticalPaths.usedBy", { count: link.used_by })}</span>
        )}
      </div>
      {link.rationale && <p style={s.linkRationale}>{link.rationale}</p>}
    </div>
  );
}

function HowToRunBody({ section, t }: { section: OnboardingSection; t: T }) {
  const steps = parseSteps(section.body);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);

  if (steps.length === 0) {
    return <p style={s.emptyBody}>{t("sections.howToRun.empty")}</p>;
  }

  const copy = (i: number, text: string) => {
    copyToClipboard(text);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex((cur) => (cur === i ? null : cur)), 1200);
  };

  return (
    <div>
      {steps.map((step, i) => (
        // Steps are re-derived deterministically from the section body on every
        // render (no reordering/filtering from the UI) — an index key is safe here.
        <div key={i} style={s.stepRow}>
          <span style={s.stepNumber}>{i + 1}</span>
          <code className="mono" style={s.stepCode}>
            {step}
          </code>
          <IconBtn
            icon={copiedIndex === i ? "Check" : "Copy"}
            label={t("sections.howToRun.copyStep", { n: i + 1 })}
            onClick={() => copy(i, step)}
          />
        </div>
      ))}
    </div>
  );
}

function FirstTasksBody({ section, t }: { section: OnboardingSection; t: T }) {
  if (!section.body.trim()) {
    return <p style={s.emptyBody}>{t("sections.firstTasks.empty")}</p>;
  }
  return <Markdown>{section.body}</Markdown>;
}
