// Pure GitHub Actions workflow-YAML template for the Export-to-CI bundle
// (SPEC-07 T2). No DB/adapter/container/fs/network.
//
// SECURITY — this file's output is the lethal-trifecta surface (untrusted PR
// diffs + secrets + network egress all meet in one workflow run) and is
// LOAD-BEARING: a human reviews every line of the generated workflow before
// merging the config PR the export opens. Treat every invariant below as a
// hard requirement, never a nicety:
//   - `permissions:` has EXACTLY `contents: read` + `pull-requests: write`.
//   - Trigger is `pull_request` (NEVER `pull_request_target`).
//   - No PR-comment trigger anywhere (`issue_comment` / `pull_request_review_comment`).
//   - The only LLM key referenced is `${{ secrets.OPENROUTER_API_KEY }}` — no
//     literal key, no `OPENAI_API_KEY`.
//   - The review step is self-contained (`run: node .devdigest/runner/index.js`)
//     — no marketplace `uses: <owner>/<action>@…` on that step.
//   - An `actions/upload-artifact` step uploads the result JSON.
//
// A template literal (not `yaml.stringify`) is used here on purpose, for
// exact, human-reviewable control over the emitted file. `${{ ... }}` are
// GitHub Actions expressions, not JS template interpolation — they are
// written as `\${{ ... }}` so they are emitted LITERALLY.

import {
  CHECKOUT_ACTION,
  SETUP_NODE_ACTION,
  UPLOAD_ARTIFACT_ACTION,
  NODE_VERSION,
  RUNNER_DIR,
  RESULT_FILENAME,
  RUNNER_ARTIFACT_NAME,
} from './constants.js';

export interface WorkflowInput {
  /** Chosen subset of the PR-event triggers, e.g. ['opened', 'synchronize']. */
  triggers: string[];
  post_as: 'github_review' | 'pr_comment' | 'none';
}

export function buildWorkflowYaml(input: WorkflowInput): string {
  const types = input.triggers.join(', ');
  return `name: DevDigest Review
on:
  pull_request:
    types: [${types}]
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: ${CHECKOUT_ACTION}
      - uses: ${SETUP_NODE_ACTION}
        with:
          node-version: '${NODE_VERSION}'
      - name: DevDigest review
        run: node ${RUNNER_DIR}/index.js
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: \${{ github.repository }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
          DEVDIGEST_POST_AS: ${input.post_as}
      - name: Upload result artifact
        if: always()
        uses: ${UPLOAD_ARTIFACT_ACTION}
        with:
          name: ${RUNNER_ARTIFACT_NAME}
          path: ${RESULT_FILENAME}
`;
}
