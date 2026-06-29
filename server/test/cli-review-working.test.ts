import { describe, it, expect } from 'vitest';
import { runWorkingReview } from '../src/cli/review-working.js';
import { deterministicReviewSummary } from '../src/cli/summary.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { Finding } from '@devdigest/shared';

/**
 * Hermetic test of the pre-push CLI pipeline: working-copy diff → reviewer-core
 * engine (mock LLM) → findings. Proves a planted secret in the working copy
 * surfaces as a CRITICAL secret_leak blocker. No git, no real LLM, no Docker.
 */

// NOTE: the "secret" below is deliberately a NON-matching placeholder — the mock
// LLM returns the secret_leak finding regardless of diff content, and a real
// `sk_live_<24+ alnum>` pattern would trip GitHub push protection.
const DIFF_WITH_SECRET = `diff --git a/src/config.ts b/src/config.ts
index e69de29..1111111 100644
--- a/src/config.ts
+++ b/src/config.ts
@@ -0,0 +1,2 @@
+export const STRIPE_KEY = "sk_live_REDACTED_FAKE_TEST_KEY";
+export const PORT = 3001;
`;

// A valid Review fixture: secret_leak passes grounding via file-in-diff (no line
// match required for full-file kinds).
const REVIEW_FIXTURE = {
  verdict: 'request_changes',
  summary: 'A live Stripe secret is committed in plaintext.',
  score: 8,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 1,
      end_line: 1,
      rationale: 'A live Stripe secret key is committed in source.',
      suggestion: 'Move it to an environment variable / secret store.',
      confidence: 0.97,
      kind: 'secret_leak',
    },
  ],
};

describe('runWorkingReview', () => {
  it('catches a planted secret in the working copy as a CRITICAL blocker', async () => {
    const llm = new MockLLMProvider('anthropic', {
      structured: REVIEW_FIXTURE,
      completionText: 'Do not push: a live secret is committed in src/config.ts.',
    });

    const logs: string[] = [];
    const result = await runWorkingReview({
      loadWorkingDiff: async () => DIFF_WITH_SECRET,
      resolveLlm: async () => ({
        llm,
        model: 'claude-sonnet-4-6',
        summaryModel: 'claude-haiku-4-5',
      }),
      log: (l) => logs.push(l),
    });

    expect(result.changedFiles).toBe(1);
    expect(result.blockers).toBe(1);
    expect(result.findings.some((f: Finding) => f.kind === 'secret_leak')).toBe(true);
    expect(result.summary).toContain('secret');
    // exactly one review call + one summary call
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(1);
    expect(logs.join('\n')).toContain('src/config.ts:1');
  });

  it('reports a clean working copy when there are no changes (no LLM call)', async () => {
    const llm = new MockLLMProvider('anthropic', { structured: REVIEW_FIXTURE });
    const logs: string[] = [];
    const result = await runWorkingReview({
      loadWorkingDiff: async () => '',
      resolveLlm: async () => ({ llm, model: 'm', summaryModel: 'm' }),
      log: (l) => logs.push(l),
    });

    expect(result.changedFiles).toBe(0);
    expect(result.findings).toEqual([]);
    expect(llm.calls).toHaveLength(0);
    expect(logs.join('\n')).toContain('No working-copy changes');
  });
});

describe('deterministicReviewSummary', () => {
  it('summarizes counts + verdict', () => {
    const findings = [
      { severity: 'CRITICAL' } as Finding,
      { severity: 'WARNING' } as Finding,
    ];
    const out = deterministicReviewSummary({
      files: ['a.ts', 'b.ts'],
      findings,
      verdict: 'request_changes',
    });
    expect(out).toBe('2 files reviewed · 2 findings, 1 blocker · verdict: request changes.');
  });
});
