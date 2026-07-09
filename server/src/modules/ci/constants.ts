// Shared string constants for the Export-to-CI feature (SPEC-07). Pure — no
// DB/adapter/container/fs/network. Consumed by manifest.ts, workflow.ts, and
// (later) the ci service/repository.

/** Root dir the bundle writes into a target repo's working tree. */
export const DEVDIGEST_DIR = '.devdigest';

/** Branch the "open_pr" export path pushes its config-PR commit onto. */
export const CI_BRANCH = 'devdigest/ci';

/** Repo-relative path of the generated GitHub Actions workflow file. */
export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';

/** Filename of the JSON result artifact the runner writes each run. */
export const RESULT_FILENAME = 'devdigest-result.json';

/** The GitHub Actions artifact name the workflow uploads the result under. */
export const RUNNER_ARTIFACT_NAME = 'devdigest-result';

/** Repo-relative dir the bundled runner script (`index.js`) is embedded at. */
export const RUNNER_DIR = `${DEVDIGEST_DIR}/runner`;

// --- Pinned GitHub Action versions referenced by the generated workflow ---
export const CHECKOUT_ACTION = 'actions/checkout@v4';
export const SETUP_NODE_ACTION = 'actions/setup-node@v4';
export const UPLOAD_ARTIFACT_ACTION = 'actions/upload-artifact@v4';
export const NODE_VERSION = '20';
