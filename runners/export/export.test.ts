import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { exportPatchDataset, exportSftDataset } from "./export-dataset";
import { extractSolutionPatch, matchesReferenceSolution } from "./solution-patch";
import { prepareRunForExport } from "./prepare-run";

const repoRoot = resolve(import.meta.dir, "../..");
const fixtureRunDir = join(import.meta.dir, "fixtures/successful-run");
const taskDir = join(repoRoot, "tasks/authentication.bearer-profile.v1");

describe("solution patch extraction", () => {
  test("extracts a unified diff from starter to workspace", () => {
    const patch = extractSolutionPatch(taskDir, join(fixtureRunDir, "workspace"));
    expect(patch).not.toBeNull();
    expect(patch?.files_changed).toContain("src/server.ts");
    expect(patch?.patch).toContain("--- a/src/server.ts");
    expect(patch?.patch).toContain("+const expectedToken");
  });

  test("detects reference solution matches", () => {
    const referenceWorkspace = join(taskDir, "solutions/reference");
    expect(matchesReferenceSolution(taskDir, referenceWorkspace)).toBe(true);
    expect(matchesReferenceSolution(taskDir, join(fixtureRunDir, "workspace"))).toBe(false);
  });
});

describe("run export filters", () => {
  test("exports fixture successful run with dataset metadata", async () => {
    const { prepared, skipReason } = await prepareRunForExport(fixtureRunDir, {
      minScore: 100,
      allowPrivateEval: false,
      tasksRoot: join(repoRoot, "tasks"),
    });

    expect(skipReason).toBeNull();
    expect(prepared?.dataset.split).toBe("dev");
    expect(prepared?.dataset.leakage_group).toBe("authentication.bearer-profile");
    expect(prepared?.prompt).toContain("Bearer Token Profile Endpoint");
    expect(prepared?.filesChanged).toContain("src/server.ts");
  });

  test("skips non-agent runs", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-"));
    try {
      writeFileSync(
        join(tempDir, "result.json"),
        JSON.stringify({
          task_id: "authentication.bearer-profile.v1",
          mode: "reference",
          status: "completed",
          score: 100,
        }),
      );

      const { skipReason } = await prepareRunForExport(tempDir, {
        minScore: 100,
        allowPrivateEval: false,
        tasksRoot: join(repoRoot, "tasks"),
      });

      expect(skipReason).toBe("not_agent_run");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("skips below-min-score runs", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-"));
    try {
      writeFileSync(
        join(tempDir, "result.json"),
        JSON.stringify({
          task_id: "authentication.bearer-profile.v1",
          mode: "agent",
          agent_id: "fixture-agent",
          status: "completed",
          score: 75,
        }),
      );

      const { skipReason } = await prepareRunForExport(tempDir, {
        minScore: 100,
        allowPrivateEval: false,
        tasksRoot: join(repoRoot, "tasks"),
      });

      expect(skipReason).toBe("below_min_score");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("dataset export commands", () => {
  test("writes SFT and patch JSONL outputs", async () => {
    const tempDir = mkdtempSync(join(import.meta.dir, ".tmp-export-out-"));
    const runsRoot = join(tempDir, "runs");
    const outRoot = join(tempDir, "out");
    const copiedRunDir = join(runsRoot, "fixture-successful-authentication.bearer-profile.v1");

    try {
      cpSync(fixtureRunDir, copiedRunDir, { recursive: true });

      const sftOut = join(outRoot, "sft.jsonl");
      const patchOut = join(outRoot, "patches.jsonl");

      const sftSummary = await exportSftDataset({
        runsPattern: join(runsRoot, "**"),
        outPath: sftOut,
        minScore: 100,
        allowPrivateEval: false,
        tasksRoot: join(repoRoot, "tasks"),
      });

      const patchSummary = await exportPatchDataset({
        runsPattern: join(runsRoot, "**"),
        outPath: patchOut,
        minScore: 100,
        allowPrivateEval: false,
        tasksRoot: join(repoRoot, "tasks"),
      });

      expect(sftSummary.exported).toBe(1);
      expect(patchSummary.exported).toBe(1);
      expect(existsSync(sftOut)).toBe(true);
      expect(existsSync(patchOut)).toBe(true);

      const sftRecord = JSON.parse(readFileSync(sftOut, "utf8").trim());
      expect(sftRecord.messages).toHaveLength(3);
      expect(sftRecord.metadata.task_id).toBe("authentication.bearer-profile.v1");
      expect(sftRecord.metadata.dataset.leakage_group).toBe("authentication.bearer-profile");
      expect(sftRecord.messages[2].content).toContain("src/server.ts");

      const patchRecord = JSON.parse(readFileSync(patchOut, "utf8").trim());
      expect(patchRecord.files_changed).toContain("src/server.ts");
      expect(patchRecord.dataset.split).toBe("dev");
      expect(patchRecord.prompt).toContain("Bearer Token Profile Endpoint");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
