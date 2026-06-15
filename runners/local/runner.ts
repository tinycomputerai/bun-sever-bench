import { writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { validateTaskDirectory } from "../../validators/validate-task";
import { runShellCommand, startManagedProcess, waitForHttpReadiness } from "./exec";
import {
  buildResult,
  failedOutcome,
  markSkippedAfter,
  skippedOutcomes,
  statusForFailedPhase,
} from "./result";
import type { RunMode, RunResult, TaskConfig } from "./types";
import { createRunDirectory, materializeWorkspace } from "./workspace";

const repoRoot = resolve(import.meta.dir, "../..");

export async function runTask(taskPath: string, mode: RunMode): Promise<RunResult> {
  const startedAt = new Date().toISOString();
  const runStartedMs = Date.now();
  const taskDir = resolve(process.cwd(), taskPath);
  const validationPath = relativeToCwd(taskDir);

  const validation = await validateTaskDirectory(validationPath);
  if (validation.errors.length > 0) {
    const taskId = validation.taskId ?? basename(taskDir);
    const runDir = createRunDirectory(repoRoot, taskId);
    const result = buildResult({
      taskId,
      taskVersion: "unknown",
      specVersion: "unknown",
      runId: basename(runDir),
      mode,
      status: "invalid_task",
      maxScore: 100,
      startedAt,
      completedAt: new Date().toISOString(),
      durations: emptyDurations(Date.now() - runStartedMs),
      outcome: skippedOutcomes(),
      error: validation.errors.join("\n"),
    });
    writeResult(runDir, result);
    return result;
  }

  const task = await loadTaskConfig(taskDir);
  const runDir = createRunDirectory(repoRoot, task.id);
  const runId = basename(runDir);
  const workspaceDir = join(runDir, "workspace");
  const logsDir = join(runDir, "logs");

  const durations = emptyDurations(0);
  const outcome = skippedOutcomes();
  let status: RunResult["status"] = "completed";
  let error: string | null = null;
  let app: Awaited<ReturnType<typeof startManagedProcess>> | undefined;

  const totalTimeoutMs = task.timeouts.total_seconds * 1000;
  const deadline = () => runStartedMs + totalTimeoutMs;

  const fail = (phase: keyof RunResult["outcome"], message: string) => {
    outcome[phase] = failedOutcome(phase);
    Object.assign(outcome, markSkippedAfter(outcome, phase));
    status = statusForFailedPhase(phase);
    error = message;
  };

  try {
    materializeWorkspace(taskDir, workspaceDir, mode);

    if (Date.now() >= deadline()) {
      status = "timed_out";
      error = "run exceeded total timeout before install";
      return finalize();
    }

    const install = await runShellCommand({
      command: task.dependencies.install_command,
      cwd: workspaceDir,
      timeoutMs: remainingMs(deadline(), task.timeouts.install_seconds * 1000),
      stdoutPath: join(logsDir, "install.stdout.log"),
      stderrPath: join(logsDir, "install.stderr.log"),
    });
    durations.install_ms = install.durationMs;

    if (install.timedOut || Date.now() >= deadline()) {
      status = "timed_out";
      error = "install timed out";
      outcome.install = "failed";
      Object.assign(outcome, markSkippedAfter(outcome, "install"));
      return finalize();
    }

    if (install.exitCode !== 0) {
      fail("install", `install exited with status ${install.exitCode}`);
      return finalize();
    }
    outcome.install = "passed";

    if (Date.now() >= deadline()) {
      status = "timed_out";
      error = "run exceeded total timeout before start";
      Object.assign(outcome, markSkippedAfter(outcome, "install"));
      return finalize();
    }

    const startStartedMs = Date.now();
    app = await startManagedProcess({
      command: task.interfaces.process.start_command,
      cwd: workspaceDir,
      stdoutPath: join(logsDir, "start.stdout.log"),
      stderrPath: join(logsDir, "start.stderr.log"),
    });

    const startWaitMs = remainingMs(deadline(), task.timeouts.start_seconds * 1000);
    await sleep(Math.min(startWaitMs, 250));
    durations.start_ms = Date.now() - startStartedMs;

    if (app.proc.exitCode !== null) {
      await app.stop();
      fail("start", `start command exited early with status ${app.proc.exitCode}`);
      return finalize();
    }
    outcome.start = "passed";

    const readiness = task.interfaces.process.readiness;
    if (readiness.type !== "http") {
      await app.stop();
      fail("readiness", `unsupported readiness type: ${readiness.type}`);
      return finalize();
    }

    const readinessResult = await waitForHttpReadiness({
      port: app.port,
      path: readiness.path ?? "/",
      expectedStatus: readiness.expected_status ?? 200,
      timeoutMs: remainingMs(deadline(), task.timeouts.readiness_seconds * 1000),
      process: app,
    });
    durations.readiness_ms = readinessResult.durationMs;

    if (Date.now() >= deadline()) {
      await app.stop();
      status = "timed_out";
      error = "run exceeded total timeout during readiness";
      outcome.readiness = "failed";
      Object.assign(outcome, markSkippedAfter(outcome, "readiness"));
      return finalize();
    }

    if (!readinessResult.ok) {
      await app.stop();
      if (readinessResult.reason === "exited") {
        outcome.start = "failed";
        outcome.readiness = "skipped";
        status = "failed_start";
        error = "process exited before readiness check passed";
      } else {
        fail("readiness", "readiness check did not pass before timeout");
      }
      return finalize();
    }
    outcome.readiness = "passed";

    const publicTests = await runShellCommand({
      command: task.tests.public.command,
      cwd: workspaceDir,
      timeoutMs: remainingMs(deadline(), task.timeouts.test_seconds * 1000),
      stdoutPath: join(logsDir, "public-tests.stdout.log"),
      stderrPath: join(logsDir, "public-tests.stderr.log"),
    });
    durations.public_tests_ms = publicTests.durationMs;

    if (publicTests.timedOut || Date.now() >= deadline()) {
      status = "timed_out";
      error = "public tests timed out";
      outcome.public_tests = "failed";
      Object.assign(outcome, markSkippedAfter(outcome, "public_tests"));
      return finalize();
    }

    if (publicTests.exitCode !== 0) {
      fail("public_tests", `public tests exited with status ${publicTests.exitCode}`);
      return finalize();
    }
    outcome.public_tests = "passed";

    const hiddenTests = await runShellCommand({
      command: task.tests.hidden.command,
      cwd: taskDir,
      env: { BUN_BENCH_APP_DIR: workspaceDir },
      timeoutMs: remainingMs(deadline(), task.timeouts.test_seconds * 1000),
      stdoutPath: join(logsDir, "hidden-tests.stdout.log"),
      stderrPath: join(logsDir, "hidden-tests.stderr.log"),
    });
    durations.hidden_tests_ms = hiddenTests.durationMs;

    if (hiddenTests.timedOut || Date.now() >= deadline()) {
      status = "timed_out";
      error = "hidden tests timed out";
      outcome.hidden_tests = "failed";
      return finalize();
    }

    if (hiddenTests.exitCode !== 0) {
      fail("hidden_tests", `hidden tests exited with status ${hiddenTests.exitCode}`);
      return finalize();
    }
    outcome.hidden_tests = "passed";
    status = "completed";
    error = null;
  } catch (runError) {
    status = "failed_start";
    error = runError instanceof Error ? runError.message : String(runError);
  } finally {
    await app?.stop();
  }

  return finalize();

  function finalize(): RunResult {
    durations.total_ms = Date.now() - runStartedMs;
    const result = buildResult({
      taskId: task?.id ?? basename(taskDir),
      taskVersion: task?.task_version ?? "unknown",
      specVersion: task?.spec_version ?? "unknown",
      runId,
      mode,
      status,
      maxScore: task?.scoring.max_score ?? 100,
      startedAt,
      completedAt: new Date().toISOString(),
      durations,
      outcome,
      error,
    });
    writeResult(runDir, result);
    return result;
  }
}

async function loadTaskConfig(taskDir: string): Promise<TaskConfig> {
  const taskYamlPath = join(taskDir, "task.yaml");
  return Bun.YAML.parse(await Bun.file(taskYamlPath).text()) as TaskConfig;
}

function relativeToCwd(absolutePath: string): string {
  const cwd = process.cwd();
  return absolutePath.startsWith(`${cwd}/`) ? absolutePath.slice(cwd.length + 1) : absolutePath;
}

function writeResult(runDir: string, result: RunResult): void {
  writeFileSync(join(runDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
}

function emptyDurations(totalMs: number): RunResult["durations"] {
  return {
    install_ms: 0,
    start_ms: 0,
    readiness_ms: 0,
    public_tests_ms: 0,
    hidden_tests_ms: 0,
    total_ms: totalMs,
  };
}

function remainingMs(deadlineMs: number, phaseTimeoutMs: number): number {
  const remainingTotal = Math.max(0, deadlineMs - Date.now());
  return Math.max(0, Math.min(phaseTimeoutMs, remainingTotal));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
