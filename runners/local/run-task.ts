#!/usr/bin/env bun

import { runTask } from "./runner";
import type { RunMode } from "./types";

function parseArgs(argv: string[]): { taskPath: string; mode: RunMode } {
  const args = argv.filter((arg) => arg !== "--");
  let mode: RunMode = "starter";
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === "--reference") {
      mode = "reference";
      continue;
    }
    positional.push(arg);
  }

  if (positional.length !== 1) {
    throw new Error("usage: bun run run:task <task-path> [--reference]");
  }

  return { taskPath: positional[0], mode };
}

async function main(): Promise<void> {
  const { taskPath, mode } = parseArgs(process.argv.slice(2));
  const result = await runTask(taskPath, mode);

  console.log(`run_id: ${result.run_id}`);
  console.log(`status: ${result.status}`);
  console.log(`score: ${result.score}/${result.max_score}`);
  console.log(`result: runs/${result.run_id}/result.json`);

  if (result.error) {
    console.error(result.error);
  }

  if (result.status !== "completed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
