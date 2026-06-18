#!/usr/bin/env node
// Stop hook — once per session, if this session changed code under a tracked module,
// block the stop ONCE and prompt Claude to run /engineering-insights (the skill the
// project uses to capture durable learnings). A hook can't hard-invoke a skill, so it
// injects guidance via `additionalContext` and blocks the stop a single time.
//
// Gate chain (any miss => exit 0 silently, session stops normally):
//   1. stop_hook_active !== true        — recursion guard
//   2. session state exists & !nudged   — fire at most once per session
//   3. code changed since baseline      — new commits OR dirty tracked files under
//                                          client/ | server/ | reviewer-core/ | e2e/
//
// State (baselineHead, nudged) is written by insights-baseline.mjs (SessionStart) to
// the OS temp dir keyed by session_id. Mirrors the routing in
// .claude/skills/engineering-insights/SKILL.md.

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const MODULE_DIRS = ["client/", "server/", "reviewer-core/", "e2e/"];

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function stateFile(sessionId) {
  const safe = String(sessionId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(tmpdir(), "devdigest-insights", `${safe}.json`);
}

function inModule(path) {
  // git porcelain paths use forward slashes on every platform.
  return MODULE_DIRS.some((d) => path.startsWith(d));
}

function pass(input) {
  // Re-clone of the gate chain so we can bail early and return false on any failure.
  if (input.stop_hook_active === true) return null;

  const file = stateFile(input.session_id);
  let state;
  try {
    state = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null; // no baseline (session predates the hook) — don't nag
  }
  if (state.nudged === true) return null;

  const cwd = input.cwd || process.cwd();

  // New commits since the baseline?
  const head = git(["rev-parse", "HEAD"], cwd).trim();
  let changed = head !== "" && head !== state.baselineHead;

  // Or dirty working-tree files under a module dir? --porcelain includes untracked
  // ("?? path") so brand-new source files count; git already excludes .gitignore'd
  // paths (node_modules, .next, build output), so this is real, un-ignored work.
  if (!changed) {
    const porcelain = git(["status", "--porcelain"], cwd);
    changed = porcelain
      .split("\n")
      .map((l) => l.slice(3).trim()) // drop the 2-char XY status + space
      .filter(Boolean)
      .map((p) => (p.includes(" -> ") ? p.split(" -> ")[1] : p)) // renames
      .some(inModule);
  }
  if (!changed) return null;

  // Mark nudged so we fire only once, then prompt.
  try {
    writeFileSync(file, JSON.stringify({ ...state, nudged: true }), "utf8");
  } catch {
    // if we can't persist, better to skip than risk looping
    return null;
  }
  return true;
}

try {
  const input = readStdin();
  if (pass(input) === true) {
    const out = {
      decision: "block",
      reason:
        "Substantive session — capture engineering insights before stopping.",
      hookSpecificOutput: {
        hookEventName: "Stop",
        additionalContext:
          "This session changed code under a tracked module (client/server/reviewer-core/e2e). " +
          "Run the /engineering-insights skill now: re-read each touched module's INSIGHTS.md, " +
          "append any durable, non-obvious learnings (or confirm nothing met the bar), then stop.",
      },
    };
    process.stdout.write(JSON.stringify(out));
  }
} catch {
  // never block a stop on hook error
}
process.exit(0);
