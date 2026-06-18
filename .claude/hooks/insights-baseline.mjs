#!/usr/bin/env node
// SessionStart hook — records a per-session baseline so the Stop hook
// (insights-capture.mjs) can tell whether this session actually changed code.
//
// Writes { baselineHead, nudged:false } to a per-session state file in the OS temp
// dir (keyed by session_id) so nothing lands in the repo. On `source === "compact"`
// we leave the existing state untouched — compaction is mid-session, not a new one.
//
// Hooks must never break the session: every failure path exits 0 silently.

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function gitHead(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return ""; // not a repo / no commits yet — treat as empty baseline
  }
}

function stateFile(sessionId) {
  const dir = join(tmpdir(), "devdigest-insights");
  mkdirSync(dir, { recursive: true });
  // session_id can contain path-unsafe chars in theory — sanitize.
  const safe = String(sessionId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(dir, `${safe}.json`);
}

try {
  const input = readStdin();
  // Don't reset state on compaction — it's a continuation of the same session.
  if (input.source === "compact") process.exit(0);

  const cwd = input.cwd || process.cwd();
  const file = stateFile(input.session_id);
  writeFileSync(
    file,
    JSON.stringify({ baselineHead: gitHead(cwd), nudged: false }),
    "utf8",
  );
} catch {
  // never block a session start
}
process.exit(0);
