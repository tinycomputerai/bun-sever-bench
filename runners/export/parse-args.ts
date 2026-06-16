import type { ExportOptions } from "./types";

export function parseExportArgs(argv: string[]): ExportOptions {
  const args = argv.filter((arg) => arg !== "--");
  let runsPattern: string | undefined;
  let outPath: string | undefined;
  let minScore = 100;
  let allowPrivateEval = false;
  let tasksRoot: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--runs") {
      runsPattern = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--out") {
      outPath = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--min-score") {
      minScore = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--allow-private-eval") {
      allowPrivateEval = true;
      continue;
    }
    if (arg === "--tasks-root") {
      tasksRoot = args[index + 1];
      index += 1;
      continue;
    }
    throw new Error(usage());
  }

  if (!runsPattern || !outPath) {
    throw new Error(usage());
  }

  if (!Number.isFinite(minScore)) {
    throw new Error("--min-score must be a number");
  }

  return {
    runsPattern,
    outPath,
    minScore,
    allowPrivateEval,
    tasksRoot,
  };
}

function usage(): string {
  return [
    "usage: bun run export:sft --runs <run-pattern> --out <output.jsonl> [options]",
    "",
    "options:",
    "  --min-score <number>       minimum score to export (default: 100)",
    "  --allow-private-eval       include private_eval tasks (default: excluded)",
    "  --tasks-root <path>        task package root (default: tasks)",
  ].join("\n");
}
