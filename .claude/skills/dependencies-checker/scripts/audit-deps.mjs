#!/usr/bin/env node
// Inventories every package's dependencies + on-disk size, and flags names
// that appear in more than one package. Run from the repo root:
//   node .claude/skills/dependencies-checker/scripts/audit-deps.mjs
// Prints one JSON object to stdout — no other output, so it's pipeable.

import fs from "node:fs";
import path from "node:path";

const PACKAGES = [
  { name: "server", pm: "pnpm" },
  { name: "client", pm: "pnpm" },
  { name: "reviewer-core", pm: "npm" },
  { name: "e2e", pm: "npm" },
];

const ROOT = process.cwd();

function depPathSegments(depName) {
  // scoped packages ("@fastify/autoload") are a nested dir, not a literal folder name
  return depName.startsWith("@") ? depName.split("/") : [depName];
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// Full, de-duplicated size of a node_modules tree: every physical file counted
// once (dedup by realpath), symlinks followed. Used for the package total.
function dirSizeDeduped(root, visited) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    let real;
    try {
      real = fs.realpathSync(full);
    } catch {
      continue; // broken symlink
    }
    if (visited.has(real)) continue;
    visited.add(real);
    let stat;
    try {
      stat = fs.statSync(real);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      total += dirSizeDeduped(real, visited);
    } else if (stat.isFile()) {
      total += stat.size;
    }
  }
  return total;
}

// Size of one top-level dependency's own subtree (its code + its nested deps).
// Local dedup only (cycle-safe) — NOT deduped against sibling dependencies, so
// a heavy nested package shared by two direct deps is counted under both. That
// overstates "savings from removing X" when X shares subtrees with a sibling;
// treat this as a ranking signal, not an exact reclaimable-bytes figure.
function depSubtreeSize(depDir) {
  if (!fs.existsSync(depDir)) return null;
  const visited = new Set();
  const real = fs.realpathSync(depDir);
  visited.add(real);
  const stat = fs.statSync(real);
  if (stat.isFile()) return stat.size;
  return dirSizeDeduped(real, visited) + 0;
}

function resolvedVersion(depDir) {
  const pkg = readJson(path.join(depDir, "package.json"));
  return pkg?.version ?? null;
}

const result = { generatedAt: new Date().toISOString(), packages: [] };

for (const { name, pm } of PACKAGES) {
  const dir = path.join(ROOT, name);
  const pkgJson = readJson(path.join(dir, "package.json"));
  if (!pkgJson) {
    result.packages.push({ name, dir: name, error: "package.json not found" });
    continue;
  }
  const nodeModules = path.join(dir, "node_modules");
  const installed = fs.existsSync(nodeModules);

  const deps = [];
  for (const [type, field] of [
    ["prod", "dependencies"],
    ["dev", "devDependencies"],
  ]) {
    for (const [depName, declaredRange] of Object.entries(pkgJson[field] ?? {})) {
      const depDir = installed ? path.join(nodeModules, ...depPathSegments(depName)) : null;
      const depInstalled = !!depDir && fs.existsSync(depDir);
      deps.push({
        name: depName,
        type,
        declaredRange,
        installed: depInstalled,
        resolvedVersion: depInstalled ? resolvedVersion(depDir) : null,
        sizeBytes: depInstalled ? depSubtreeSize(depDir) : null,
      });
    }
  }
  deps.sort((a, b) => (b.sizeBytes ?? -1) - (a.sizeBytes ?? -1));

  result.packages.push({
    name,
    dir: name,
    packageManager: pm,
    installed,
    totalNodeModulesBytes: installed ? dirSizeDeduped(nodeModules, new Set()) : null,
    dependencies: deps,
  });
}

// Cross-package: same dependency name declared in 2+ packages.
const byName = new Map();
for (const pkg of result.packages) {
  for (const dep of pkg.dependencies ?? []) {
    const list = byName.get(dep.name) ?? [];
    list.push({
      package: pkg.name,
      type: dep.type,
      declaredRange: dep.declaredRange,
      resolvedVersion: dep.resolvedVersion,
    });
    byName.set(dep.name, list);
  }
}
result.crossPackage = [...byName.entries()]
  .filter(([, occurrences]) => occurrences.length > 1)
  .map(([name, occurrences]) => ({
    name,
    occurrences,
    versionsMatch: new Set(occurrences.map((o) => o.resolvedVersion)).size <= 1,
  }))
  .sort((a, b) => b.occurrences.length - a.occurrences.length);

process.stdout.write(JSON.stringify(result, null, 2));
