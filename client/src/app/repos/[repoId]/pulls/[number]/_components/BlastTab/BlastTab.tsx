/* BlastTab — the PR's blast radius SECTION on the Overview tab, read from the
   repo-intel index. Compact, impact-sorted tree: changed symbols (most callers
   first) → callers (file:line → GitHub) → impacted endpoints/crons. Symbols with
   no callers are tucked behind a toggle; the model summary is collapsible. Shows
   a partial-index badge when degraded and an empty state when there's nothing. */
"use client";

import React from "react";
import { Icon, Badge, Skeleton, ErrorState, SectionLabel } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import type { BlastResponse, ChangedSymbol, DownstreamImpact } from "@devdigest/shared";
import { useBlastRadius } from "@/lib/hooks/blast";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

type T = ReturnType<typeof useTranslations>;

interface BlastTabProps {
  prId: string | null;
  /** owner/repo — used to deep-link a caller's file:line to GitHub. */
  repoFullName?: string | null;
  /** PR head sha — pins the blob link so line numbers stay accurate. */
  headSha?: string | null;
}

/** Append () to callable kinds so a symbol reads like the design (`rateLimit()`). */
function displayName(sym: ChangedSymbol): string {
  return sym.kind === "function" || sym.kind === "method" ? `${sym.name}()` : sym.name;
}

export function BlastTab({ prId, repoFullName, headSha }: BlastTabProps) {
  const t = useTranslations("blast");
  const { data, isLoading, isError, refetch } = useBlastRadius(prId);

  return (
    <div style={s.card}>
      <SectionLabel icon="Zap">{t("title")}</SectionLabel>
      <div style={s.scroll}>
        <Body
          data={data}
          isLoading={isLoading}
          isError={isError}
          refetch={refetch}
          repoFullName={repoFullName}
          headSha={headSha}
          t={t}
        />
      </div>
    </div>
  );
}

function Body({
  data,
  isLoading,
  isError,
  refetch,
  repoFullName,
  headSha,
  t,
}: {
  data: BlastResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  repoFullName?: string | null;
  headSha?: string | null;
  t: T;
}) {
  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={18} width={240} />
        <Skeleton height={90} />
        <Skeleton height={120} />
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState title={t("error")} onRetry={() => refetch()} />;
  }

  const { blast, degraded } = data;
  const { changed_symbols, downstream, summary } = blast;

  const totalCallers = downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpointCount = new Set(downstream.flatMap((d) => d.endpoints_affected)).size;
  const cronCount = new Set(downstream.flatMap((d) => d.crons_affected)).size;
  const downByName = new Map(downstream.map((d) => [d.symbol, d]));
  const canLink = !!(repoFullName && headSha);

  if (changed_symbols.length === 0 && downstream.length === 0) {
    return (
      <>
        {degraded && <DegradedBanner t={t} />}
        <EmptyBlast t={t} />
      </>
    );
  }

  // (1) Impact-sorted: symbols WITH callers first (most callers → name), the rest
  // (no callers) tucked under a toggle so they don't drown the signal.
  const impactful = changed_symbols
    .map((sym) => ({ sym, down: downByName.get(sym.name) }))
    .filter((x): x is { sym: ChangedSymbol; down: DownstreamImpact } => !!x.down && x.down.callers.length > 0)
    .sort((a, b) => b.down.callers.length - a.down.callers.length || a.sym.name.localeCompare(b.sym.name));
  const unaffected = changed_symbols.filter((sym) => !downByName.get(sym.name)?.callers.length);

  return (
    <>
      <div style={s.statRow}>
        <Badge icon="Code" mono>{`${changed_symbols.length} ${t("stat.symbols")}`}</Badge>
        <Badge icon="GitBranch" mono>{`${totalCallers} ${t("stat.callers")}`}</Badge>
        <Badge icon="Globe" mono>{`${endpointCount} ${t("stat.endpoints")}`}</Badge>
        {cronCount > 0 && <Badge icon="Clock" mono>{`${cronCount} ${t("stat.crons")}`}</Badge>}
        {degraded && (
          <Badge dot color="var(--warn)" bg="var(--warn-bg)">
            {t("degraded.badge")}
          </Badge>
        )}
      </div>

      {degraded && <DegradedBanner t={t} />}

      {summary && <SummarySection summary={summary} t={t} />}

      {impactful.map(({ sym, down }, i) => (
        <SymbolNode
          key={`${sym.name}:${sym.file}`}
          sym={sym}
          down={down}
          defaultOpen={i === 0}
          canLink={canLink}
          repoFullName={repoFullName}
          headSha={headSha}
          t={t}
        />
      ))}

      {unaffected.length > 0 && <UnaffectedSection symbols={unaffected} t={t} />}
    </>
  );
}

function SummarySection({ summary, t }: { summary: string; t: T }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div>
      <div style={s.summaryLabel}>
        <Icon.Sparkles size={12} />
        {t("summaryLabel")}
      </div>
      <p
        style={s.summaryText(expanded)}
        onClick={() => setExpanded((o) => !o)}
        title={expanded ? undefined : summary}
      >
        {summary}
      </p>
    </div>
  );
}

function SymbolNode({
  sym,
  down,
  defaultOpen,
  canLink,
  repoFullName,
  headSha,
  t,
}: {
  sym: ChangedSymbol;
  down: DownstreamImpact;
  defaultOpen: boolean;
  canLink: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  t: T;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div style={s.symbolRow}>
      <div style={s.symbolHeader(open)} onClick={() => setOpen((o) => !o)} role="button" aria-expanded={open}>
        <Icon.ChevronRight size={13} style={s.chevron(open)} />
        <Icon.Code size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span className="mono" style={s.symbolName}>
          {displayName(sym)}
        </span>
        <span style={s.symbolKind}>{sym.kind}</span>
        <div style={{ marginLeft: "auto" }}>
          <Badge mono>{t("callerCount", { count: down.callers.length })}</Badge>
        </div>
      </div>

      {open && (
        <>
          <div style={s.callerList}>
            {down.callers.map((c, i) => (
              <CallerRow
                key={`${c.file}:${c.line}:${i}`}
                file={c.file}
                line={c.line}
                name={c.name}
                href={canLink ? githubBlobUrl(repoFullName!, headSha!, c.file, c.line) : undefined}
              />
            ))}
          </div>

          {(down.endpoints_affected.length > 0 || down.crons_affected.length > 0) && (
            <div style={s.badges}>
              {down.endpoints_affected.map((ep) => (
                <Badge key={ep} icon="Globe" mono color="var(--accent-text)" bg="var(--bg-hover)">
                  {ep}
                </Badge>
              ))}
              {down.crons_affected.map((cr) => (
                <Badge key={cr} icon="Clock" mono color="var(--warn)" bg="var(--warn-bg)">
                  {cr}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** A caller row: `↳ <dir-truncated>/<filename:line>` linking to the GitHub blob. */
function CallerRow({
  file,
  line,
  name,
  href,
}: {
  file: string;
  line: number;
  name: string;
  href?: string;
}) {
  const slash = file.lastIndexOf("/");
  const dir = slash >= 0 ? file.slice(0, slash + 1) : "";
  const base = slash >= 0 ? file.slice(slash + 1) : file;
  const full = `${file}:${line}`;
  const inner = (
    <>
      {dir && <span style={s.callerDir}>{dir}</span>}
      <span className="mono" style={s.callerBase}>
        {base}:{line}
      </span>
    </>
  );
  return (
    <div style={s.callerRow}>
      <span style={s.callerArrow}>↳</span>
      {href ? (
        <a
          href={href}
          title={full}
          target="_blank"
          rel="noopener noreferrer"
          className="mono"
          style={s.callerLink}
          onClick={(e) => e.stopPropagation()}
        >
          {inner}
        </a>
      ) : (
        <span className="mono" title={full} style={s.callerLink}>
          {inner}
        </span>
      )}
      {name && <span style={s.callerName}>{name}</span>}
    </div>
  );
}

function UnaffectedSection({ symbols, t }: { symbols: ChangedSymbol[]; t: T }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <div
        style={s.unaffectedToggle}
        onClick={() => setOpen((o) => !o)}
        role="button"
        aria-expanded={open}
      >
        <Icon.ChevronRight size={13} style={s.chevron(open)} />
        {t("unaffected", { count: symbols.length })}
      </div>
      {open && (
        <div style={s.unaffectedList}>
          {symbols.map((sym) => (
            <span key={`${sym.name}:${sym.file}`} className="mono" style={s.unaffectedChip} title={sym.file}>
              {displayName(sym)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DegradedBanner({ t }: { t: T }) {
  return (
    <div style={s.degradedBanner}>
      <Icon.AlertTriangle size={15} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
      <span style={s.degradedText}>{t("degraded.explain")}</span>
    </div>
  );
}

function EmptyBlast({ t }: { t: T }) {
  return (
    <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--text-secondary)" }}>
      <Icon.Zap size={24} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
        {t("empty.title")}
      </div>
      <div style={{ fontSize: 13, maxWidth: 320, margin: "0 auto", lineHeight: 1.5 }}>
        {t("empty.body")}
      </div>
    </div>
  );
}
