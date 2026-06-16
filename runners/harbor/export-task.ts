#!/usr/bin/env bun

import { exportTask } from "./export";

const DEFAULT_OUT_ROOT = "harbor";

function parseArgs(argv: string[]): { taskPath: string; outRoot: string } {
  const args = argv.filter((arg) => arg !== "--");
  let taskPath: string | undefined;
  let outRoot = DEFAULT_OUT_ROOT;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--task") {
      taskPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--out") {
      outRoot = args[index + 1];
      index += 1;
      continue;
    }
    if (!taskPath && !arg.startsWith("-")) {
      taskPath = arg;
      continue;
    }
    throw new Error(usage());
  }

  if (!taskPath) {
    throw new Error(usage());
  }
  return { taskPath, outRoot };
}

function usage(): string {
  return "usage: bun run harbor:export --task <task-dir> [--out <out-root>]";
}

async function main(): Promise<void> {
  const { taskPath, outRoot } = parseArgs(process.argv.slice(2));
  const result = await exportTask(taskPath, outRoot);
  console.log(`exported ${result.id}`);
  console.log(`  harbor name: ${result.harborName}`);
  console.log(`  package:     ${result.outDir}`);
  console.log(`\nrun it with:\n  harbor run -p ${result.outDir} --agent oracle -e docker -y`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
