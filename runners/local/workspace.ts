import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RunMode } from "./types";

const LOCKFILES = ["bun.lock", "bun.lockb"] as const;

export function createRunDirectory(repoRoot: string, taskId: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = resolve(repoRoot, "runs", `${timestamp}-${taskId}`);
  mkdirSync(join(runDir, "workspace"), { recursive: true });
  mkdirSync(join(runDir, "logs"), { recursive: true });
  return runDir;
}

export function materializeWorkspace(
  taskDir: string,
  workspaceDir: string,
  mode: RunMode,
): void {
  copyIfExists(join(taskDir, "task.yaml"), join(workspaceDir, "task.yaml"));
  copyIfExists(join(taskDir, "prompt.md"), join(workspaceDir, "prompt.md"));

  if (mode === "reference") {
    const referenceDir = join(taskDir, "solutions", "reference");
    copyDirectory(referenceDir, workspaceDir);
  } else {
    copyIfExists(join(taskDir, "package.json"), join(workspaceDir, "package.json"));
    copyDirectory(join(taskDir, "src"), join(workspaceDir, "src"));
  }

  for (const lockfile of LOCKFILES) {
    const source = join(taskDir, lockfile);
    if (existsSync(source)) {
      copyIfExists(source, join(workspaceDir, lockfile));
      break;
    }
  }

  copyPublicFixtures(taskDir, workspaceDir);
  copyDirectory(join(taskDir, "tests", "public"), join(workspaceDir, "tests", "public"));
  copyDirectory(join(taskDir, "tests", "helpers"), join(workspaceDir, "tests", "helpers"));
}

function copyPublicFixtures(taskDir: string, workspaceDir: string): void {
  const publicFixtures = join(taskDir, "fixtures", "public");
  if (existsSync(publicFixtures)) {
    copyDirectory(publicFixtures, join(workspaceDir, "fixtures", "public"));
    return;
  }

  const fixturesDir = join(taskDir, "fixtures");
  if (!existsSync(fixturesDir)) {
    return;
  }

  const entries = readdirSync(fixturesDir);
  const hasRealFiles = entries.some((entry) => entry !== ".gitkeep");
  if (hasRealFiles) {
    copyDirectory(fixturesDir, join(workspaceDir, "fixtures"));
  }
}

function copyIfExists(source: string, destination: string): void {
  if (!existsSync(source)) {
    return;
  }
  mkdirSync(resolve(destination, ".."), { recursive: true });
  cpSync(source, destination);
}

function copyDirectory(source: string, destination: string): void {
  if (!existsSync(source)) {
    throw new Error(`missing directory: ${source}`);
  }
  cpSync(source, destination, { recursive: true });
}
