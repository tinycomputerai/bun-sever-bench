#!/usr/bin/env bun

import { exportSftDataset, formatExportSummary } from "./export-dataset";
import { parseExportArgs } from "./parse-args";

async function main(): Promise<void> {
  const options = parseExportArgs(process.argv.slice(2));
  const summary = await exportSftDataset(options);
  console.log(formatExportSummary("export:sft", summary));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
