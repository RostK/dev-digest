#!/usr/bin/env node
// PreToolUse gate for the pr-self-review skill.
//
// A hook can't invoke a skill directly — so when a GitHub-outbound git command
// (git push / gh pr create / gh pr merge) is attempted while the diff is
// UN-REVIEWED, STALE, or BLOCKED by a critical finding, this DENIES the command
// and injects an instruction telling Claude to run /pr-self-review first. On a
// fresh, clean review the command is allowed through.
//
// State lives in .claude/.pr-self-review-state.json (gitignored), written by the
// skill via this same script's `record` mode so the hash algorithm lives in ONE
// place and can't drift between writer and reader.
//
// Registered as a `PreToolUse` (matcher: Bash) hook in .claude/settings.json.
// Fail-open: any unexpected error exits 0 so a hook bug never hard-bricks pushing.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const STATE_FILE = join(PROJECT_DIR, ".claude", ".pr-self-review-state.json");
const BASE = process.env.PR_SELF_REVIEW_BASE || "main";

// GitHub-outbound commands that must not ship un-reviewed code.
const GATED = [/\bgit\s+push\b/, /\bgh\s+pr\s+create\b/, /\bgh\s+pr\s+merge\b/];

function git(args) {
  return execFileSync("git", args, {
    cwd: PROJECT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

// Hash of the full review scope so any change invalidates a prior review:
//   committed branch changes (base...HEAD) ∪ working tree (vs HEAD) ∪ untracked files.
// Returns "" when there is nothing to review (don't gate an empty diff).
function currentDiffHash() {
  const parts = [];
  try { parts.push(git(["diff", `${BASE}...HEAD`])); } catch { /* base may not exist locally */ }
  try { parts.push(git(["diff", "HEAD"])); } catch { /* not a repo / no HEAD */ }
  try { parts.push(git(["ls-files", "--others", "--exclude-standard"])); } catch { /* ignore */ }
  const combined = parts.join("\0");
  if (combined.trim() === "") return "";
  return createHash("sha256").update(combined).digest("hex");
}

function head() {
  try { return git(["rev-parse", "HEAD"]).trim(); } catch { return ""; }
}

// ---- record mode: the skill persists its verdict here (single source of the hash) ----
if (process.argv[2] === "record") {
  const argv = process.argv.slice(3);
  const flag = (name, def) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
  };
  const criticals = parseInt(flag("--criticals", "0"), 10) || 0;
  const verdict = flag("--verdict", criticals > 0 ? "blocked" : "clean") === "blocked" || criticals > 0
    ? "blocked"
    : "clean";
  const state = {
    reviewedDiffHash: currentDiffHash(),
    verdict,
    criticalCount: criticals,
    head: head(),
    reviewedAt: new Date().toISOString(),
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
  process.stdout.write(
    `pr-self-review: recorded verdict=${state.verdict} criticals=${state.criticalCount} ` +
      `hash=${state.reviewedDiffHash.slice(0, 12) || "(empty)"}\n`,
  );
  process.exit(0);
}

// ---- hash mode: print the current scope hash (debugging) ----
if (process.argv[2] === "hash") {
  process.stdout.write(currentDiffHash() + "\n");
  process.exit(0);
}

// ---- hook mode (default): PreToolUse gate ----
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

try {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const command = String(input?.tool_input?.command || "");
  if (!GATED.some((re) => re.test(command))) process.exit(0); // not gated → allow

  const hash = currentDiffHash();
  if (hash === "") process.exit(0); // nothing to review → allow

  if (!existsSync(STATE_FILE)) {
    deny(
      "PR Self-Review required before shipping to GitHub. Run the /pr-self-review skill " +
        "on the current diff, then retry this command.",
    );
  }

  let state = null;
  try { state = JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { /* unreadable */ }
  if (!state || typeof state !== "object") {
    deny("PR Self-Review state is missing or unreadable. Re-run /pr-self-review, then retry.");
  }

  if (state.reviewedDiffHash !== hash) {
    deny(
      "The diff changed since the last PR Self-Review — the review is stale. " +
        "Re-run /pr-self-review on the current diff, then retry this command.",
    );
  }

  if (state.verdict === "blocked") {
    deny(
      `PR Self-Review found ${state.criticalCount} critical finding(s). Resolve every critical ` +
        "and re-run /pr-self-review before shipping. Critical findings block opening/updating " +
        "the PR by design — fix them locally first.",
    );
  }

  // fresh + clean → allow
  process.exit(0);
} catch {
  // fail-open: never let a hook bug block the user from pushing
  process.exit(0);
}
