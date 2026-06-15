#!/usr/bin/env bun

import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { validateTaskDirectory } from "./validate-task";

const repoRoot = resolve(import.meta.dir, "..");
const tasksRoot = resolve(repoRoot, "tasks");

if (!existsSync(tasksRoot)) {
  console.error("tasks: directory does not exist");
  process.exit(1);
}

const taskDirs = readdirSync(tasksRoot)
  .map((entry) => resolve(tasksRoot, entry))
  .filter((entry) => statSync(entry).isDirectory())
  .sort();

if (taskDirs.length === 0) {
  console.error("tasks: no task directories found");
  process.exit(1);
}

let invalidCount = 0;

for (const taskDir of taskDirs) {
  const result = await validateTaskDirectory(taskDir);
  if (result.errors.length === 0) {
    console.log(`valid task: ${result.taskId ?? taskDir}`);
    continue;
  }

  invalidCount += 1;
  console.error(`invalid task: ${result.taskId ?? taskDir}`);
  for (const error of result.errors) {
    console.error(`  - ${error}`);
  }
}

if (invalidCount > 0) {
  console.error(`validation failed: ${invalidCount}/${taskDirs.length} task(s) invalid`);
  process.exit(1);
}

console.log(`validation passed: ${taskDirs.length} task(s) valid`);
