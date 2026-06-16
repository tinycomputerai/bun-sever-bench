import { SFT_SYSTEM_PROMPT } from "./constants";
import type { PreparedRun } from "./prepare-run";
import type { PatchRecord, SftRecord } from "./types";

export function buildSftRecord(prepared: PreparedRun): SftRecord {
  const durationMs = prepared.result.durations?.total_ms ?? prepared.result.metrics?.wall_time_ms ?? 0;

  return {
    messages: [
      { role: "system", content: SFT_SYSTEM_PROMPT },
      { role: "user", content: prepared.prompt },
      { role: "assistant", content: prepared.patch },
    ],
    metadata: {
      task_id: prepared.result.task_id,
      run_id: prepared.result.run_id,
      score: prepared.result.score,
      agent_id: prepared.result.agent_id ?? "unknown",
      duration_ms: durationMs,
      token_input: prepared.result.metrics?.input_tokens ?? 0,
      token_output: prepared.result.metrics?.output_tokens ?? 0,
      dataset: {
        split: prepared.dataset.split,
        leakage_group: prepared.dataset.leakage_group,
      },
    },
  };
}

export function buildPatchRecord(prepared: PreparedRun): PatchRecord {
  return {
    task_id: prepared.result.task_id,
    run_id: prepared.result.run_id,
    prompt: prepared.prompt,
    patch: prepared.patch,
    files_changed: prepared.filesChanged,
    score: prepared.result.score,
    agent_id: prepared.result.agent_id ?? "unknown",
    dataset: {
      split: prepared.dataset.split,
      leakage_group: prepared.dataset.leakage_group,
    },
  };
}
