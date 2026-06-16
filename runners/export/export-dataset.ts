import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildPatchRecord, buildSftRecord } from "./build-records";
import { discoverRuns } from "./discover-runs";
import { createSkipCounter, prepareRunForExport } from "./prepare-run";
import type { ExportOptions, ExportSummary, PatchRecord, SftRecord } from "./types";
import type { PreparedRun } from "./prepare-run";

export async function exportSftDataset(options: ExportOptions): Promise<ExportSummary> {
  return exportDataset(options, buildSftRecord);
}

export async function exportPatchDataset(options: ExportOptions): Promise<ExportSummary> {
  return exportDataset(options, buildPatchRecord);
}

async function exportDataset<T extends SftRecord | PatchRecord>(
  options: ExportOptions,
  buildRecord: (prepared: PreparedRun) => T,
): Promise<ExportSummary> {
  const runDirs = discoverRuns(options.runsPattern);
  const skipped = createSkipCounter();
  const records: T[] = [];

  for (const runDir of runDirs) {
    const { prepared, skipReason } = await prepareRunForExport(runDir, {
      minScore: options.minScore,
      allowPrivateEval: options.allowPrivateEval,
      tasksRoot: options.tasksRoot,
    });

    if (!prepared) {
      if (skipReason) {
        skipped[skipReason] += 1;
      }
      continue;
    }

    records.push(buildRecord(prepared));
  }

  const outPath = resolve(process.cwd(), options.outPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    records.length > 0 ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "",
  );

  return {
    discovered: runDirs.length,
    exported: records.length,
    skipped,
    out_path: outPath,
  };
}

export function formatExportSummary(label: string, summary: ExportSummary): string {
  const skippedEntries = Object.entries(summary.skipped).filter(([, count]) => count > 0);
  const skippedText =
    skippedEntries.length > 0
      ? skippedEntries.map(([reason, count]) => `${reason}: ${count}`).join(", ")
      : "none";

  return [
    `[${label}] complete`,
    `discovered runs: ${summary.discovered}`,
    `exported records: ${summary.exported}`,
    `skipped: ${skippedText}`,
    `output: ${summary.out_path}`,
  ].join("\n");
}
