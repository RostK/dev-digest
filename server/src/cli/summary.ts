import type { Finding, LLMProvider, Verdict } from '@devdigest/shared';

/**
 * One-paragraph, cheap-model summary of a working-copy review — the CLI analog
 * of `modules/blast/summary.ts`: exactly one `complete()` call, with a
 * deterministic fallback on any failure (missing key, provider error, empty
 * completion). Mirrors that module's "≤1 model call, always degrade" contract.
 */

export interface ReviewSummaryInput {
  files: string[];
  findings: Finding[];
  verdict: Verdict;
}

/** Model-free summary; the fallback whenever the cheap call is skipped or fails. */
export function deterministicReviewSummary(input: ReviewSummaryInput): string {
  const n = input.findings.length;
  const blockers = input.findings.filter((f) => f.severity === 'CRITICAL').length;
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
  const blockerPart = blockers > 0 ? `, ${plural(blockers, 'blocker')}` : '';
  return (
    `${plural(input.files.length, 'file')} reviewed · ${plural(n, 'finding')}${blockerPart} · ` +
    `verdict: ${input.verdict.replace('_', ' ')}.`
  );
}

const SYSTEM_PROMPT =
  'You summarize a pre-push code review for the engineer about to push. Given the ' +
  'changed files and findings, write ONE concise paragraph (max 60 words) stating ' +
  'whether it is safe to push and the top risk. Plain text only — no markdown, no preamble.';

function renderForPrompt(input: ReviewSummaryInput): string {
  const lines: string[] = [];
  lines.push(`Changed files (${input.files.length}): ${input.files.join(', ')}`);
  lines.push(`Verdict: ${input.verdict}`);
  lines.push(`Findings (${input.findings.length}):`);
  for (const f of input.findings.slice(0, 30)) {
    lines.push(`- [${f.severity}] ${f.title} (${f.file}:${f.start_line})`);
  }
  return lines.join('\n');
}

/** Summarize the review via ONE cheap-model call; deterministic fallback on failure. */
export async function summarizeReview(
  llm: LLMProvider,
  model: string,
  input: ReviewSummaryInput,
): Promise<string> {
  const fallback = deterministicReviewSummary(input);
  try {
    const res = await llm.complete({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: renderForPrompt(input) },
      ],
      temperature: 0.3,
      maxTokens: 200,
    });
    const text = res.text.trim();
    return text.length > 0 ? text : fallback;
  } catch {
    return fallback;
  }
}
