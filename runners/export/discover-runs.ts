import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

export function discoverRuns(pattern: string, cwd = process.cwd()): string[] {
  const normalized = pattern.replace(/\\/g, "/").replace(/\/+$/, "");

  if (!normalized.includes("*")) {
    const absolute = resolve(cwd, normalized);
    if (existsSync(join(absolute, "result.json"))) {
      return [absolute];
    }
    throw new Error(`no result.json found at ${normalized}`);
  }

  const runsRoot = resolveRunsRoot(normalized, cwd);
  if (!existsSync(runsRoot)) {
    throw new Error(`runs root does not exist: ${relative(cwd, runsRoot)}`);
  }

  return readdirSync(runsRoot)
    .map((entry) => resolve(runsRoot, entry))
    .filter((entry) => statSync(entry).isDirectory())
    .filter((entry) => existsSync(join(entry, "result.json")))
    .sort();
}

function resolveRunsRoot(pattern: string, cwd: string): string {
  const wildcardIndex = pattern.indexOf("*");
  const prefix = pattern.slice(0, wildcardIndex).replace(/\/+$/, "");
  const absolutePrefix = resolve(cwd, prefix || ".");

  if (basename(absolutePrefix) === "runs" || prefix.endsWith("/runs") || prefix === "runs") {
    return absolutePrefix;
  }

  let current = absolutePrefix;
  while (current !== dirname(current)) {
    if (basename(current) === "runs") {
      return current;
    }
    current = dirname(current);
  }

  return resolve(cwd, "runs");
}
