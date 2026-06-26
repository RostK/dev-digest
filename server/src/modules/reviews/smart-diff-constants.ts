/**
 * Thresholds and classification patterns for the Smart Diff composer.
 *
 * Priority (first match wins):
 *   1. boilerplate — lock files, manifests, generated/build dirs, snapshots,
 *                    minified files, source maps, generated migrations
 *   2. wiring      — barrel/index files, entrypoints, config, env, CI
 *   3. core        — everything else (the default)
 *
 * Lock files MUST always land in boilerplate — patterns below are intentionally
 * broad (basename match OR segment match) to cover all package managers.
 */

export const BOILERPLATE_PATTERNS: RegExp[] = [
  // package manager lock files
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.lock$/,
  /Cargo\.lock$/,
  /poetry\.lock$/,
  /composer\.lock$/,
  /Gemfile\.lock$/,
  // package manifests (pure dependency list, no logic)
  /(?:^|\/)package\.json$/,
  // generated / build output directories
  /(?:^|\/)dist\//,
  /(?:^|\/)build\//,
  /(?:^|\/)out\//,
  /(?:^|\/)\.next\//,
  /(?:^|\/)coverage\//,
  /(?:^|\/)node_modules\//,
  // snapshots
  /(?:^|\/)__snapshots__\//,
  /\.snap$/,
  // minified files and source maps
  /\.min\.[^/]+$/,
  /\.map$/,
  // generated SQL migrations (top-level or nested)
  /(?:^|\/)migrations\/[^/]+\.sql$/,
  // test / spec files — unit tests are mechanical, not business logic
  /(?:^|\/)__tests__\//,
  /(?:^|\/)tests?\//,
  /\.(test|spec)\.[tj]sx?$/,
];

export const WIRING_PATTERNS: RegExp[] = [
  // barrel / index files
  /(?:^|\/)index\.[tj]sx?$/,
  // common entrypoints
  /(?:^|\/)server\.[tj]sx?$/,
  /(?:^|\/)main\.[tj]sx?$/,
  /(?:^|\/)app\.[tj]sx?$/,
  // app config module (e.g. src/config.ts) — wires env/settings into the app
  /(?:^|\/)config\.[tj]sx?$/,
  // config files (e.g. vite.config.ts, jest.config.js, webpack.config.mjs)
  /\.config\.[^/]+$/,
  // TypeScript project files
  /tsconfig[^/]*\.json$/,
  // dot-rc files (e.g. .eslintrc, .babelrc, .prettierrc)
  /\.[a-z][a-z0-9]*rc(?:\.[a-z]+)?$/i,
  // YAML / yml (CI, Docker Compose, etc.)
  /\.[yw]a?ml$/,
  // env files
  /\.env(?:\.[^/]+)?$/,
  // GitHub Actions / CI config dirs
  /(?:^|\/)\.github\//,
];

/** Total lines (additions + deletions) above which a PR is flagged as too-big. */
export const SPLIT_TOO_BIG_LINES = 500;

/**
 * Number of leading path segments used to group files into proposed splits.
 * E.g. 2 → "src/api" groups all files under src/api/ together.
 */
export const SPLIT_DIR_DEPTH = 2;
