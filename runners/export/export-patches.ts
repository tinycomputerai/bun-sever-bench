#!/usr/bin/env bun

import { exportPatchDataset, formatExportSummary } from "./export-dataset";
import { parseExportArgs } from "./parse-args";

async function main(): Promise<void> {
  const options = parseExportArgs(process.argv.slice(2));
  const summary = await exportPatchDataset(options);
  console.log(formatExportSummary("export:patches", summary));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
