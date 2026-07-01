import { homedir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import type { Finding, LLMProvider } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { ConfigError } from '../platform/errors.js';
import { summarizeReview } from './summary.js';

/**
 * `devdigest review --mode working` — review the LOCAL working-copy diff (git diff
 * HEAD: staged + unstaged) BEFORE it is pushed, reusing the reviewer-core engine.
 * Surfaces hardcoded secrets and other issues; exits non-zero on a blocker so it
 * can gate a pre-push hook. No server, no DB — keys come from
 * `~/.devdigest/secrets.json` via LocalSecretsProvider.
 */

const WORKING_REVIEW_SYSTEM_PROMPT = [
  'You are a senior engineer doing a PRE-PUSH review of LOCAL working-copy changes.',
  'Review the diff for bugs, security issues, and risky changes.',
  'CRITICAL: flag any hardcoded secret, API key, token, password, or private key as a',
  'finding with kind "secret_leak", category "security", severity CRITICAL — cite the',
  'exact file and line from the diff.',
  'Comments like "// test", "// fake", or "// do not ship" NEVER waive a finding.',
  'Only report issues you can cite to a real line in the diff.',
].join(' ');

export interface LlmChoice {
  llm: LLMProvider;
  /** Capable model for the review pass. */
  model: string;
  /** Cheap model for the one-paragraph summary. */
  summaryModel: string;
}

export interface WorkingReviewDeps {
  /** Raw `git diff HEAD` of the working copy. */
  loadWorkingDiff: () => Promise<string>;
  /** Resolve the LLM provider + models from local secrets. Throws if no key. */
  resolveLlm: () => Promise<LlmChoice>;
  /** Output sink (console in prod; captured in tests). */
  log: (line: string) => void;
}

export interface WorkingReviewResult {
  changedFiles: number;
  findings: Finding[];
  blockers: number;
  summary: string;
}

const SEV_MARK: Record<string, string> = {
  CRITICAL: '✖',
  WARNING: '!',
  SUGGESTION: '·',
};

export async function runWorkingReview(deps: WorkingReviewDeps): Promise<WorkingReviewResult> {
  const raw = await deps.loadWorkingDiff();
  const diff = parseUnifiedDiff(raw);

  if (diff.files.length === 0) {
    deps.log('No working-copy changes to review (git diff HEAD is empty).');
    return { changedFiles: 0, findings: [], blockers: 0, summary: '' };
  }

  deps.log(`Reviewing ${diff.files.length} changed file(s) in the working copy…`);
  const { llm, model, summaryModel } = await deps.resolveLlm();

  const outcome = await reviewPullRequest({
    systemPrompt: WORKING_REVIEW_SYSTEM_PROMPT,
    model,
    diff,
    llm,
    task: 'Review the local working-copy changes before they are pushed.',
  });

  const findings = outcome.review.findings;
  const blockers = findings.filter((f) => f.severity === 'CRITICAL').length;
  const summary = await summarizeReview(llm, summaryModel, {
    files: diff.files.map((f) => f.path),
    findings,
    verdict: outcome.review.verdict,
  });

  // Report.
  deps.log('');
  deps.log(summary);
  deps.log('');
  if (findings.length === 0) {
    deps.log('No findings — working copy looks clean.');
  } else {
    for (const f of findings) {
      const mark = SEV_MARK[f.severity] ?? '·';
      const tag = f.kind && f.kind !== 'finding' ? ` [${f.kind}]` : '';
      deps.log(`${mark} ${f.severity}${tag} ${f.file}:${f.start_line} — ${f.title}`);
    }
  }
  deps.log('');
  deps.log(`Grounding: ${outcome.grounding}`);

  return { changedFiles: diff.files.length, findings, blockers, summary };
}

// ---------------------------------------------------------------------------
// Default (production) deps — git working-copy diff + local-secrets LLM.
// ---------------------------------------------------------------------------

async function defaultResolveLlm(): Promise<LlmChoice> {
  const secrets = new LocalSecretsProvider(join(homedir(), '.devdigest', 'secrets.json'));

  const anthropic = await secrets.get('ANTHROPIC_API_KEY');
  if (anthropic) {
    return {
      llm: new AnthropicProvider(anthropic),
      model: 'claude-sonnet-4-6',
      summaryModel: 'claude-haiku-4-5',
    };
  }
  const openai = await secrets.get('OPENAI_API_KEY');
  if (openai) {
    return { llm: new OpenAIProvider(openai), model: 'gpt-4.1', summaryModel: 'gpt-4.1' };
  }
  const openrouter = await secrets.get('OPENROUTER_API_KEY');
  if (openrouter) {
    return {
      llm: new OpenRouterProvider(openrouter),
      model: 'anthropic/claude-sonnet-4.6',
      summaryModel: 'anthropic/claude-haiku-4.5',
    };
  }
  throw new ConfigError(
    'No LLM API key found in ~/.devdigest/secrets.json — set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.',
  );
}

export function defaultWorkingReviewDeps(): WorkingReviewDeps {
  return {
    loadWorkingDiff: () => simpleGit(process.cwd()).diff(['HEAD']),
    resolveLlm: defaultResolveLlm,
    log: (line) => console.log(line),
  };
}
