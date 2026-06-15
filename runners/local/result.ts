import type { PhaseOutcome, RunMode, RunResult, RunStatus } from "./types";

export function computeScore(
  status: RunStatus,
  maxScore: number,
): number {
  switch (status) {
    case "completed":
      return maxScore;
    case "failed_hidden_tests":
      return 25;
    default:
      return 0;
  }
}

export function buildResult(options: {
  taskId: string;
  taskVersion: string;
  specVersion: string;
  runId: string;
  mode: RunMode;
  status: RunStatus;
  maxScore: number;
  startedAt: string;
  completedAt: string;
  durations: RunResult["durations"];
  outcome: RunResult["outcome"];
  error: string | null;
}): RunResult {
  return {
    task_id: options.taskId,
    task_version: options.taskVersion,
    spec_version: options.specVersion,
    run_id: options.runId,
    mode: options.mode,
    status: options.status,
    score: computeScore(options.status, options.maxScore),
    max_score: options.maxScore,
    started_at: options.startedAt,
    completed_at: options.completedAt,
    durations: options.durations,
    outcome: options.outcome,
    artifacts: {
      install_stdout: "logs/install.stdout.log",
      install_stderr: "logs/install.stderr.log",
      start_stdout: "logs/start.stdout.log",
      start_stderr: "logs/start.stderr.log",
      public_tests_stdout: "logs/public-tests.stdout.log",
      public_tests_stderr: "logs/public-tests.stderr.log",
      hidden_tests_stdout: "logs/hidden-tests.stdout.log",
      hidden_tests_stderr: "logs/hidden-tests.stderr.log",
    },
    error: options.error,
  };
}

export function skippedOutcomes(): RunResult["outcome"] {
  return {
    install: "skipped",
    start: "skipped",
    readiness: "skipped",
    public_tests: "skipped",
    hidden_tests: "skipped",
  };
}

export function markSkippedAfter(
  outcome: RunResult["outcome"],
  failedPhase: keyof RunResult["outcome"],
): RunResult["outcome"] {
  const order: Array<keyof RunResult["outcome"]> = [
    "install",
    "start",
    "readiness",
    "public_tests",
    "hidden_tests",
  ];
  const failedIndex = order.indexOf(failedPhase);
  const next: RunResult["outcome"] = { ...outcome };

  for (let index = failedIndex + 1; index < order.length; index += 1) {
    next[order[index]] = "skipped";
  }

  return next;
}

export function statusForFailedPhase(phase: keyof RunResult["outcome"]): RunStatus {
  switch (phase) {
    case "install":
      return "failed_install";
    case "start":
      return "failed_start";
    case "readiness":
      return "failed_readiness";
    case "public_tests":
      return "failed_public_tests";
    case "hidden_tests":
      return "failed_hidden_tests";
    default:
      return "completed";
  }
}

export function failedOutcome(phase: keyof RunResult["outcome"]): PhaseOutcome {
  return "failed";
}
