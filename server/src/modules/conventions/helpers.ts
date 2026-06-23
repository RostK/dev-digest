import { z } from 'zod';
import { ConventionCategory, type ChatMessage, type ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow } from './repository.js';
import { MAX_FILE_CHARS } from './constants.js';

/**
 * Pure helpers for the conventions extractor: the model's output schema, prompt
 * assembly, evidence grounding, and the row→DTO mapper. No I/O, no DB.
 */

/** One sampled file fed to the model (full content; truncated only at prompt time). */
export interface Sample {
  path: string;
  content: string;
}

// ---- Model output schema (server-only; the persisted DTO adds id + accepted) ----
export const ConventionProposal = z.object({
  rule: z.string(),
  category: ConventionCategory,
  evidence_path: z.string(),
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
});
export type ConventionProposal = z.infer<typeof ConventionProposal>;

export const ConventionExtraction = z.object({
  candidates: z.array(ConventionProposal),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

const SYSTEM = [
  'You are a senior engineer extracting a repository\'s CODING CONVENTIONS — the',
  'house rules a reviewer should enforce. You are given config files and a sample',
  'of representative source files.',
  '',
  'Report ONLY conventions you can PROVE with a verbatim snippet copied from one',
  'of the provided files. Prefer 5–15 high-signal, enforceable rules (naming,',
  'error handling, structure, imports, typing, testing, async, style) over many',
  'trivial ones. Do not invent rules you cannot back with an exact snippet.',
].join('\n');

/** Take a HEAD prefix so cited line numbers still match the real file. */
function truncate(content: string, max = MAX_FILE_CHARS): string {
  return content.length <= max ? content : `${content.slice(0, max)}\n… (truncated)`;
}

/** Assemble the (system, user) messages for the extraction call. */
export function buildExtractionMessages(samples: Sample[]): ChatMessage[] {
  const paths = samples.map((s) => s.path).join('\n');
  const files = samples
    .map((s) => `### ${s.path}\n\`\`\`\n${truncate(s.content)}\n\`\`\``)
    .join('\n\n');
  const user = [
    'Extract the coding conventions from these files.',
    '',
    'For each convention return: `rule` (imperative + specific), `category`,',
    '`evidence_path` (EXACTLY one of the paths below), `evidence_snippet` (a',
    'VERBATIM 1–5 line excerpt copied character-for-character from that file so it',
    'can be located), and `confidence` (0–1).',
    '',
    'Valid evidence_path values:',
    paths,
    '',
    'Files:',
    files,
  ].join('\n');
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ];
}

/**
 * Normalize a model-supplied evidence path to match a sampled path key:
 * trim quotes/backticks, posix slashes, drop a leading `./` and any trailing
 * `:line` / `:start-end` reference the model may have appended.
 */
export function normalizeEvidencePath(p: string): string {
  return p
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/:\d+(?:-\d+)?$/, '')
    .trim();
}

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Locate `snippet` inside `content`, tolerant of indentation/whitespace. Returns
 * the 1-based inclusive line range, or null when the snippet isn't really there
 * (→ the candidate is dropped as ungrounded). Tries a consecutive multi-line
 * match first, then anchors on the first non-blank line.
 */
export function locateSnippet(
  content: string,
  snippet: string,
): { start: number; end: number } | null {
  const hay = content.split(/\r?\n/).map(collapse);
  const needle = snippet
    .split(/\r?\n/)
    .map(collapse)
    .filter((l) => l.length > 0);
  if (needle.length === 0) return null;

  for (let i = 0; i < hay.length; i++) {
    if (hay[i] !== needle[0]) continue;
    let ok = true;
    for (let j = 1; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return { start: i + 1, end: i + needle.length };
  }

  // Fallback: anchor on the first line if it's distinctive enough.
  const anchor = needle[0]!;
  if (anchor.length >= 4) {
    for (let i = 0; i < hay.length; i++) {
      if (hay[i]!.includes(anchor)) return { start: i + 1, end: i + 1 };
    }
  }
  return null;
}

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: ConventionCategory.catch('other').parse(row.category),
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_start_line: row.evidenceStartLine,
    evidence_end_line: row.evidenceEndLine,
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
  };
}
