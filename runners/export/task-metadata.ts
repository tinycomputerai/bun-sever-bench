import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { TaskDatasetMetadata } from "./types";

export function resolveTaskDirectory(taskId: string, tasksRoot = "tasks"): string | null {
  const taskDir = resolve(process.cwd(), tasksRoot, taskId);
  if (!existsSync(join(taskDir, "task.yaml"))) {
    return null;
  }
  return taskDir;
}

export async function loadTaskDatasetMetadata(taskDir: string): Promise<TaskDatasetMetadata> {
  const taskYamlPath = join(taskDir, "task.yaml");
  const task = (await Bun.YAML.parse(await Bun.file(taskYamlPath).text())) as {
    dataset?: Partial<TaskDatasetMetadata>;
  };

  const dataset = task.dataset;
  if (!dataset?.split || !dataset.leakage_group || dataset.trainable === undefined) {
    throw new Error(`task.yaml missing dataset metadata: ${taskDir}`);
  }

  return {
    split: dataset.split,
    leakage_group: dataset.leakage_group,
    trainable: dataset.trainable,
  };
}
