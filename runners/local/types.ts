export type RunMode = "starter" | "reference";

export type RunStatus =
  | "completed"
  | "failed_install"
  | "failed_start"
  | "failed_readiness"
  | "failed_public_tests"
  | "failed_hidden_tests"
  | "timed_out"
  | "invalid_task";

export type PhaseOutcome = "passed" | "failed" | "skipped";

export type TaskConfig = {
  id: string;
  spec_version: string;
  task_version: string;
  interfaces: {
    process: {
      start_command: string;
      readiness: {
        type: string;
        path?: string;
        expected_status?: number;
      };
    };
  };
  tests: {
    public: { command: string };
    hidden: { command: string };
  };
  timeouts: {
    install_seconds: number;
    start_seconds: number;
    readiness_seconds: number;
    test_seconds: number;
    total_seconds: number;
  };
  dependencies: {
    install_command: string;
  };
  scoring: {
    max_score: number;
  };
};

export type RunResult = {
  task_id: string;
  task_version: string;
  spec_version: string;
  run_id: string;
  mode: RunMode;
  status: RunStatus;
  score: number;
  max_score: number;
  started_at: string;
  completed_at: string;
  durations: {
    install_ms: number;
    start_ms: number;
    readiness_ms: number;
    public_tests_ms: number;
    hidden_tests_ms: number;
    total_ms: number;
  };
  outcome: {
    install: PhaseOutcome;
    start: PhaseOutcome;
    readiness: PhaseOutcome;
    public_tests: PhaseOutcome;
    hidden_tests: PhaseOutcome;
  };
  artifacts: {
    install_stdout: string;
    install_stderr: string;
    start_stdout: string;
    start_stderr: string;
    public_tests_stdout: string;
    public_tests_stderr: string;
    hidden_tests_stdout: string;
    hidden_tests_stderr: string;
  };
  error: string | null;
};

export type CommandResult = {
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
};
