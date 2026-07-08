/* eval-case.ts — pure builder: a finding -> the evals `AgentCase`-shaped
   clipboard template (AC-24, T5). Field style + shape match
   evals/agents/architecture-reviewer/architecture-reviewer.cases.ts
   (`{ name, kind, prompt, practices, threshold, maxTurns }`) so the copied text
   drops straight into a `*.cases.ts` file's `cases: AgentCase[]` array.

   NO network call, NO write into evals/ — this only builds a string and (via
   writeEvalCaseToClipboard) copies it to the clipboard. The finding's title /
   rationale / suggestion are UNTRUSTED LLM output: they are escaped and
   serialized as DATA into the template string below, never evaluated. */

import type { FindingRecord } from "@devdigest/shared";

export interface EvalCaseContext {
  /** The agent that produced the finding (attribution, AC-17) — used only to
   *  label the generated case's `name`; it is never sent anywhere. */
  agentName?: string | null;
}

/** Escape a string for embedding inside a single-quoted TS string literal. */
function escapeSingleQuoted(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, "\\n");
}

/** Escape a string for embedding inside a backtick TS template literal. */
function escapeTemplateLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function locationLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/**
 * Build the eval-case template text — an `AgentCase`-shaped object literal
 * ready to paste into an `evals/**\/*.cases.ts` `cases: AgentCase[]` array.
 * Pure: no I/O, no clipboard, no network.
 */
export function buildEvalCaseTemplate(finding: FindingRecord, ctx: EvalCaseContext = {}): string {
  const where = `${finding.file}:${locationLabel(finding)}`;
  const name = escapeSingleQuoted(
    `${ctx.agentName ? `[${ctx.agentName}] ` : ""}${finding.title} (${where})`,
  );
  const promptLines = [
    "Review this change and confirm whether it still exhibits the finding below.",
    "",
    `Finding: ${finding.title}`,
    `Severity: ${finding.severity}`,
    `Category: ${finding.category}`,
    `Location: ${where}`,
    "",
    "Rationale:",
    finding.rationale,
    ...(finding.suggestion ? ["", "Suggested fix:", finding.suggestion] : []),
    "",
    "// TODO: paste the diff / file excerpt this finding was raised against.",
  ];
  const prompt = escapeTemplateLiteral(promptLines.join("\n"));
  const practices = [
    escapeSingleQuoted(`flags the issue described in "${finding.title}" at ${where}`),
    escapeSingleQuoted(`assigns a severity consistent with ${finding.severity}`),
  ];

  return [
    "{",
    `  name: '${name}',`,
    `  kind: 'quality',`,
    `  prompt: \`${prompt}\`,`,
    `  practices: [`,
    ...practices.map((p) => `    '${p}',`),
    `  ],`,
    `  threshold: 1.0,`,
    `  maxTurns: 25,`,
    "}",
  ].join("\n");
}

/**
 * Copy the template to the clipboard. Returns whether the write succeeded.
 * No toast/i18n here (a plain module, not a component) — the caller (a
 * component, via `useTranslations`) shows the confirmation. Makes NO server
 * call and writes NOTHING into `evals/` (AC-24).
 */
export async function writeEvalCaseToClipboard(
  finding: FindingRecord,
  ctx: EvalCaseContext = {},
): Promise<boolean> {
  const template = buildEvalCaseTemplate(finding, ctx);
  try {
    await navigator.clipboard.writeText(template);
    return true;
  } catch {
    return false;
  }
}
