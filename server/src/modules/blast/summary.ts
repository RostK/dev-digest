import type { Container } from '../../platform/container.js';
import type { ChatMessage } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';
import { BLAST_SUMMARY_DEFAULT_MODEL, BLAST_SUMMARY_MAX_TOKENS } from './constants.js';

/**
 * One-line, model-free summary of the map. Always available — used as the
 * fallback whenever the LLM call is skipped or fails.
 */
export function deterministicSummary(result: BlastResult): string {
  const symbols = result.changedSymbols.length;
  const callers = result.callers.length;
  const endpoints = new Set(result.impactedEndpoints).size;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return (
    `${plural(symbols, 'changed symbol')} with ${plural(callers, 'caller')} ` +
    `across ${plural(endpoints, 'impacted endpoint')}.`
  );
}

/** Compact textual rendering of the map for the summary prompt (bounded). */
function renderForPrompt(result: BlastResult): string {
  const lines: string[] = [];
  lines.push(`Changed symbols (${result.changedSymbols.length}):`);
  for (const s of result.changedSymbols.slice(0, 30)) {
    lines.push(`- ${s.kind} ${s.name} (${s.file})`);
  }
  lines.push('');
  lines.push(`Callers (${result.callers.length}):`);
  for (const c of result.callers.slice(0, 50)) {
    lines.push(`- ${c.symbol} at ${c.file}:${c.line} calls ${c.viaSymbol}`);
  }
  const endpoints = [...new Set(result.impactedEndpoints)];
  lines.push('');
  lines.push(`Impacted endpoints (${endpoints.length}): ${endpoints.join(', ') || 'none'}`);
  return lines.join('\n');
}

const SYSTEM_PROMPT =
  'You explain code-change "blast radius" maps to a pull-request reviewer. ' +
  'Given the map, write ONE concise paragraph (max 70 words) describing what ' +
  'these changes could break downstream. Plain text only — no markdown, no ' +
  'preamble, no bullet points.';

/**
 * Produce the map's one-paragraph summary via EXACTLY ONE cheap-model call,
 * falling back to {@link deterministicSummary} on any failure (missing API key,
 * provider error, empty completion). This is the only model touch in the
 * feature; everything else is pure repo-intel reads.
 */
export async function summarize(container: Container, result: BlastResult): Promise<string> {
  const fallback = deterministicSummary(result);

  // Nothing to summarize → skip the model entirely (still zero/one-call honest).
  if (result.changedSymbols.length === 0 && result.callers.length === 0) {
    return fallback;
  }

  try {
    const choice = BLAST_SUMMARY_DEFAULT_MODEL;
    const llm = await container.llm(choice.provider);
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: renderForPrompt(result) },
    ];
    const res = await llm.complete({
      model: choice.model,
      messages,
      temperature: 0.3,
      maxTokens: BLAST_SUMMARY_MAX_TOKENS,
    });
    const text = res.text.trim();
    return text.length > 0 ? text : fallback;
  } catch {
    // Missing key / provider error / timeout → deterministic summary.
    return fallback;
  }
}
