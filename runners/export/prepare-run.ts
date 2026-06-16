import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { constructPrompt } from "../agent/prompt";
import type { TaskConfig } from "../local/types";
import { loadTaskDatasetMetadata, resolveTaskDirectory } from "./task-metadata";
import { extractSolutionPatch, matchesReferenceSolution } from "./solution-patch";
import type { ExportRunResult, ExportSkipReason, TaskDatasetMetadata } from "./types";

export type PreparedRun = {
  runDir: string;
  result: ExportRunResult;
  taskDir: string;
  dataset: TaskDatasetMetadata;
  prompt: string;
  patch: string;
  filesChanged: string[];
};

export async function prepareRunForExport(
  runDir: string,
  options: {
    minScore: number;
    allowPrivateEval: boolean;
    tasksRoot?: string;
  },
): Promise<{ prepared: PreparedRun | null; skipReason: ExportSkipReason | null }> {
  const resultPath = join(runDir, "result.json");
  if (!existsSync(resultPath)) {
    return { prepared: null, skipReason: "missing_result" };
  }

  let result: ExportRunResult;
  try {
    result = JSON.parse(readFileSync(resultPath, "utf8")) as ExportRunResult;
  } catch {
    return { prepared: null, skipReason: "invalid_result" };
  }

  if (result.mode !== "agent" || !result.agent_id) {
    return { prepared: null, skipReason: "not_agent_run" };
  }

  if (result.status !== "completed") {
    return { prepared: null, skipReason: "not_completed" };
  }

  if (result.score < options.minScore) {
    return { prepared: null, skipReason: "below_min_score" };
  }

  const taskDir = resolveTaskDirectory(result.task_id, options.tasksRoot);
  if (!taskDir) {
    return { prepared: null, skipReason: "missing_task" };
  }

  let dataset: TaskDatasetMetadata;
  try {
    dataset = await loadTaskDatasetMetadata(taskDir);
  } catch {
    return { prepared: null, skipReason: "missing_task" };
  }

  if (dataset.split === "private_eval" && !options.allowPrivateEval) {
    return { prepared: null, skipReason: "private_eval_excluded" };
  }

  if (!dataset.trainable) {
    return { prepared: null, skipReason: "not_trainable" };
  }

  const workspaceDir = join(runDir, "workspace");
  if (!existsSync(workspaceDir)) {
    return { prepared: null, skipReason: "missing_solution" };
  }

  if (matchesReferenceSolution(taskDir, workspaceDir)) {
    return { prepared: null, skipReason: "reference_solution" };
  }

  let patchResult;
  try {
    patchResult = extractSolutionPatch(taskDir, workspaceDir);
  } catch {
    return { prepared: null, skipReason: "hidden_tests_in_patch" };
  }

  if (!patchResult) {
    return { prepared: null, skipReason: "missing_solution" };
  }

  const prompt = await loadPrompt(runDir, taskDir);
  if (!prompt) {
    return { prepared: null, skipReason: "missing_prompt" };
  }

  return {
    prepared: {
      runDir,
      result,
      taskDir,
      dataset,
      prompt,
      patch: patchResult.patch,
      filesChanged: patchResult.files_changed,
    },
    skipReason: null,
  };
}

async function loadPrompt(runDir: string, taskDir: string): Promise<string | null> {
  const promptPath = join(runDir, "logs", "agent-prompt.md");
  if (existsSync(promptPath)) {
    return readFileSync(promptPath, "utf8").trim();
  }

  const taskYamlPath = join(taskDir, "task.yaml");
  if (!existsSync(taskYamlPath)) {
    return null;
  }

  const task = (await Bun.YAML.parse(await Bun.file(taskYamlPath).text())) as TaskConfig & {
    instruction?: {
      prompt_file?: string;
      summary?: string;
      constraints?: string[];
      allowed_assumptions?: string[];
      disallowed_shortcuts?: string[];
    };
  };
  return constructPrompt(taskDir, task).trim();
}

export function createSkipCounter(): Record<ExportSkipReason, number> {
  return {
    missing_result: 0,
    invalid_result: 0,
    not_agent_run: 0,
    below_min_score: 0,
    not_completed: 0,
    private_eval_excluded: 0,
    not_trainable: 0,
    missing_task: 0,
    missing_prompt: 0,
    missing_solution: 0,
    reference_solution: 0,
    hidden_tests_in_patch: 0,
  };
}
