#!/usr/bin/env node
// Stop hook for the engineering-insights skill.
//
// The `Stop` event fires after EVERY turn, and there is no "session ended" event
// that can still make Claude act — so this nudges at most ONCE per session via two
// irreducible guards:
//   1. stop_hook_active — don't re-fire within the same stop sequence (anti-loop);
//   2. a per-session marker file — fire only the first time, not once per turn.
// On that single firing it blocks the stop and asks Claude to run /engineering-insights
// (a hook can't invoke a skill directly — it injects the instruction; Claude acts on it).
//
// Registered from .claude/settings.json. Never breaks the session: every path exits 0.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  if (input.stop_hook_active === true) process.exit(0); // anti-loop

  const safe = String(input.session_id || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  const marker = join(tmpdir(), `devdigest-insights-${safe}.nudged`);
  if (existsSync(marker)) process.exit(0); // already nudged this session
  writeFileSync(marker, "1");

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: "Capture engineering insights before stopping.",
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext:
          "Before stopping, run the /engineering-insights skill: re-read each touched " +
          "module's INSIGHTS.md and append any durable, non-obvious learnings (or confirm " +
          "nothing met the bar). If no code module was touched this session, just confirm " +
          "there's nothing to capture, then stop.",
      },
    }),
  );
} catch {
  // never block a stop on a hook error
}
process.exit(0);
