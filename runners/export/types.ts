export type DatasetSplit = "train" | "dev" | "public_eval" | "private_eval";

export type TaskDatasetMetadata = {
  split: DatasetSplit;
  leakage_group: string;
  trainable: boolean;
};

export type ExportRunResult = {
  task_id: string;
  task_version: string;
  spec_version: string;
  run_id: string;
  agent_id?: string;
  mode?: string;
  status: string;
  score: number;
  max_score: number;
  started_at: string;
  completed_at: string;
  durations?: {
    total_ms?: number;
    agent_ms?: number;
  };
  metrics?: {
    wall_time_ms?: number;
    input_tokens?: number;
    output_tokens?: number;
    tool_calls?: number;
  };
};

export type SolutionPatch = {
  patch: string;
  files_changed: string[];
};

export type ExportOptions = {
  runsPattern: string;
  outPath: string;
  minScore: number;
  allowPrivateEval: boolean;
  tasksRoot?: string;
};

export type ExportSkipReason =
  | "missing_result"
  | "invalid_result"
  | "not_agent_run"
  | "below_min_score"
  | "not_completed"
  | "private_eval_excluded"
  | "not_trainable"
  | "missing_task"
  | "missing_prompt"
  | "missing_solution"
  | "reference_solution"
  | "hidden_tests_in_patch";

export type ExportSummary = {
  discovered: number;
  exported: number;
  skipped: Record<ExportSkipReason, number>;
  out_path: string;
};

export type SftRecord = {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  metadata: {
    task_id: string;
    run_id: string;
    score: number;
    agent_id: string;
    duration_ms: number;
    token_input: number;
    token_output: number;
    dataset: {
      split: DatasetSplit;
      leakage_group: string;
    };
  };
};

export type PatchRecord = {
  task_id: string;
  run_id: string;
  prompt: string;
  patch: string;
  files_changed: string[];
  score: number;
  agent_id: string;
  dataset: {
    split: DatasetSplit;
    leakage_group: string;
  };
};
