#!/usr/bin/env -S npx tsx
/**
 * devdigest CLI entrypoint.
 *
 *   devdigest review --mode working   review the local working-copy diff before push
 *
 * Exits 1 when a blocker (CRITICAL finding) is found, so it can gate a pre-push
 * hook. Exits 2 on usage errors.
 */
import { runWorkingReview, defaultWorkingReviewDeps } from './review-working.js';

function printUsage(): void {
  console.error('Usage: devdigest review --mode working');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv[0] !== 'review') {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const modeIdx = argv.indexOf('--mode');
  const mode = modeIdx >= 0 ? argv[modeIdx + 1] : 'working';
  if (mode !== 'working') {
    console.error(`Unsupported --mode "${mode}" — only "working" is implemented.`);
    process.exitCode = 2;
    return;
  }

  try {
    const result = await runWorkingReview(defaultWorkingReviewDeps());
    if (result.blockers > 0) {
      console.error(`\n✖ ${result.blockers} blocker(s) found — fix before pushing.`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`devdigest review failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  }
}

void main();
