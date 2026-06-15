import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { validateTaskDirectory } from "../../validators/validate-task";

export async function discoverTasks(pattern: string): Promise<string[]> {
  const cwd = process.cwd();
  const candidates = resolveTaskCandidates(pattern, cwd);
  const validTasks: string[] = [];

  for (const candidate of candidates) {
    const validationPath = relative(cwd, candidate).replace(/\\/g, "/");
    const result = await validateTaskDirectory(validationPath);
    if (result.errors.length === 0) {
      validTasks.push(validationPath);
    }
  }

  return validTasks.sort();
}

function resolveTaskCandidates(pattern: string, cwd: string): string[] {
  const normalized = pattern.replace(/\\/g, "/").replace(/\/+$/, "");

  if (!normalized.includes("*")) {
    const absolute = resolve(cwd, normalized);
    if (existsSync(join(absolute, "task.yaml"))) {
      return [absolute];
    }
    throw new Error(`no task.yaml found at ${normalized}`);
  }

  const tasksRoot = resolveTasksRoot(normalized, cwd);
  if (!existsSync(tasksRoot)) {
    throw new Error(`tasks root does not exist: ${relative(cwd, tasksRoot)}`);
  }

  return readdirSync(tasksRoot)
    .map((entry) => resolve(tasksRoot, entry))
    .filter((entry) => statSync(entry).isDirectory())
    .filter((entry) => existsSync(join(entry, "task.yaml")));
}

function resolveTasksRoot(pattern: string, cwd: string): string {
  const wildcardIndex = pattern.indexOf("*");
  const prefix = pattern.slice(0, wildcardIndex).replace(/\/+$/, "");
  const absolutePrefix = resolve(cwd, prefix || ".");

  if (basename(absolutePrefix) === "tasks" || prefix.endsWith("/tasks") || prefix === "tasks") {
    return absolutePrefix;
  }

  let current = absolutePrefix;
  while (current !== dirname(current)) {
    if (basename(current) === "tasks") {
      return current;
    }
    current = dirname(current);
  }

  return resolve(cwd, "tasks");
}
