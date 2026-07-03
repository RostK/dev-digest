import { z } from 'zod';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import {
  Brief,
  Risk,
  ReviewFocus,
  type BlastRadius,
  type ChatMessage,
  type Intent,
  type RiskSeverity,
  type SmartDiffRole,
} from '@devdigest/shared';
import { renderPrompt } from '../../platform/prompts.js';
import { classifyFile } from '../reviews/smart-diff.js';
import { MAX_ISSUE_CHARS, MAX_SPEC_CHARS, RISK_HIGH_CALLERS, RISK_HIGH_ENDPOINTS, RISK_MEDIUM_CALLERS, RISK_MEDIUM_ENDPOINTS } from './constants.js';

/**
 * Pure helpers for the PR Why+Risk Brief: the model-output schema, prompt
 * assembly, the deterministic (zero-model) fallback brief, grounding, and the
 * counts-only smart-diff reduction. No I/O, no DB — mirror conventions/helpers.ts.
 */

/** Model output schema — the LLM proposes `what`/`why`/risks/review_focus; the
 *  service assigns `risk_level` deterministically from the SAME risks it grounds
 *  (see AC-9) and stamps `generated_at` itself, so neither is asked of the model. */
export const BriefProposal = z.object({
  what: z.string(),
  why: z.string(),
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocus),
});
export type BriefProposal = z.infer<typeof BriefProposal>;

export interface LinkedIssueInput {
  number: number;
  title: string;
  body?: string | null;
}

export interface SpecDocInput {
  path: string;
  content: string;
}

export interface FindingInput {
  file: string;
  start_line: number;
  severity: string;
  title: string;
}

export interface SmartDiffCounts {
  role: SmartDiffRole;
  count: number;
}

/** Reduce PR files to per-role COUNTS only (AC-4) — never file bodies/diffs. */
export function smartDiffCounts(files: { path: string }[]): SmartDiffCounts[] {
  const byRole = new Map<SmartDiffRole, number>();
  for (const f of files) {
    const role = classifyFile(f.path);
    byRole.set(role, (byRole.get(role) ?? 0) + 1);
  }
  const ROLE_ORDER: SmartDiffRole[] = ['core', 'wiring', 'config', 'test', 'boilerplate'];
  return ROLE_ORDER.filter((r) => byRole.has(r)).map((role) => ({ role, count: byRole.get(role)! }));
}

function renderIntent(intent: Intent | undefined): string {
  if (!intent) return '(no stored intent for this PR)';
  const lines = [`Intent: ${intent.intent}`];
  if (intent.in_scope.length) lines.push(`In scope: ${intent.in_scope.join('; ')}`);
  if (intent.out_of_scope.length) lines.push(`Out of scope: ${intent.out_of_scope.join('; ')}`);
  return lines.join('\n');
}

function renderBlast(blast: BlastRadius): string {
  const lines: string[] = [];
  lines.push(`Changed symbols (${blast.changed_symbols.length}):`);
  for (const s of blast.changed_symbols.slice(0, 30)) lines.push(`- ${s.kind} ${s.name} (${s.file})`);
  lines.push('');
  lines.push(`Downstream impact (${blast.downstream.length} symbols):`);
  for (const d of blast.downstream.slice(0, 30)) {
    lines.push(
      `- ${d.symbol}: ${d.callers.length} caller(s), endpoints: ${d.endpoints_affected.join(', ') || 'none'}`,
    );
    for (const c of d.callers.slice(0, 10)) lines.push(`  - ${c.file}:${c.line} (${c.name})`);
  }
  return lines.join('\n');
}

function renderCounts(counts: SmartDiffCounts[]): string {
  if (counts.length === 0) return '(no changed files)';
  return counts.map((c) => `${c.role}: ${c.count} file(s)`).join(', ');
}

function renderFindings(findings: FindingInput[]): string {
  if (findings.length === 0) return '(no findings yet)';
  return findings.slice(0, 30).map((f) => `- [${f.severity}] ${f.file}:${f.start_line} — ${f.title}`).join('\n');
}

/** Assemble the (system, user) messages for the ONE generation call. Wraps the
 *  issue + spec blocks (untrusted, external-sourced text) per AC-10. */
export async function buildBriefMessages(input: {
  intent: Intent | undefined;
  blast: BlastRadius;
  counts: SmartDiffCounts[];
  realFiles: string[];
  linkedIssue: LinkedIssueInput | undefined;
  specDocs: SpecDocInput[];
  findings: FindingInput[];
}): Promise<ChatMessage[]> {
  const system = await renderPrompt('brief.system.md', {});
  const userSections: string[] = [];
  userSections.push(`## Intent\n${renderIntent(input.intent)}`);
  userSections.push(`## Blast radius\n${renderBlast(input.blast)}`);
  userSections.push(`## Changed-file counts by role\n${renderCounts(input.counts)}`);
  userSections.push(`## Real files (the ONLY valid file_refs / review_focus.path values)\n${input.realFiles.join('\n') || '(none)'}`);

  if (input.linkedIssue) {
    const body = (input.linkedIssue.body ?? '').slice(0, MAX_ISSUE_CHARS);
    userSections.push(
      `## Linked issue #${input.linkedIssue.number}: ${input.linkedIssue.title}\n${wrapUntrusted('linked-issue', body)}`,
    );
  }
  for (const doc of input.specDocs) {
    userSections.push(
      `## Spec/plan: ${doc.path}\n${wrapUntrusted(`spec:${doc.path}`, doc.content.slice(0, MAX_SPEC_CHARS))}`,
    );
  }
  userSections.push(`## Existing findings\n${renderFindings(input.findings)}`);

  return [
    { role: 'system', content: system },
    { role: 'user', content: userSections.join('\n\n') },
  ];
}

/**
 * Ground the model's proposal against the REAL file/endpoint sets (AC-3): drop
 * any `risks[].file_refs` entry and any `review_focus[]` item whose path isn't
 * in `realFiles`. Mirrors conventions/service.ts's grounding-drop.
 */
export function groundBrief(proposal: BriefProposal, realFiles: Set<string>): BriefProposal {
  const risks = proposal.risks.map((r) => ({
    ...r,
    file_refs: r.file_refs.filter((f) => realFiles.has(f)),
  }));
  const review_focus = proposal.review_focus.filter((rf) => realFiles.has(rf.path));
  return { ...proposal, risks, review_focus };
}

/** Deterministic risk_level from the blast map size (AC-9 fallback + always
 *  used to derive the persisted level — see service.ts). Mirrors
 *  blast/summary.ts's deterministicSummary style: pure counts, no model. */
export function deterministicRiskLevel(blast: BlastRadius): RiskSeverity {
  const callers = blast.downstream.reduce((n, d) => n + d.callers.length, 0);
  const endpoints = new Set(blast.downstream.flatMap((d) => d.endpoints_affected)).size;
  if (callers >= RISK_HIGH_CALLERS || endpoints >= RISK_HIGH_ENDPOINTS) return 'high';
  if (callers >= RISK_MEDIUM_CALLERS || endpoints >= RISK_MEDIUM_ENDPOINTS) return 'medium';
  return 'low';
}

/**
 * Persist decision for a freshly generated brief (AC-8): a real (non-fallback)
 * generation always persists (an explicit Regenerate always overwrites — AC-6);
 * a degraded (fallback) generation persists ONLY when no brief exists yet —
 * never clobber an existing good brief with a degraded one. Mirrors
 * onboarding/facts.ts's `shouldPersistGeneration`.
 */
export function shouldPersistBrief(degraded: boolean, hasExisting: boolean): boolean {
  return !degraded || !hasExisting;
}

/** Zero-model fallback Brief (AC-8): used when generation throws, has no key,
 *  or returns nothing usable. Always available — no external dependency. */
export function deterministicBrief(intent: Intent | undefined, blast: BlastRadius): Brief {
  const what = intent?.intent
    ? `Modifies ${blast.changed_symbols.length} symbol(s): ${intent.intent}`
    : `Modifies ${blast.changed_symbols.length} symbol(s) across the repo.`;
  const why = intent?.in_scope.length ? `In scope: ${intent.in_scope.join('; ')}.` : 'No stored intent available.';
  return {
    what,
    why,
    risk_level: deterministicRiskLevel(blast),
    risks: [],
    review_focus: [],
  };
}
