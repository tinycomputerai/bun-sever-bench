import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Agent, AgentContext, AgentRunOutcome } from "./types";
import { isOnPath, pipeToFile, prepareLogFiles, remainingMs } from "./process";

const CODEX_BIN = "codex";

export type CodexAgentOptions = {
  /** Agent id recorded in result.json (e.g. "codex-cli", "gpt-5"). */
  id: string;
  /** Optional model override passed to `codex exec --model`. */
  model?: string;
};

/**
 * OpenAI Codex CLI adapter. Runs `codex exec` non-interactively against the
 * materialized workspace. The same implementation backs both the `codex-cli`
 * agent (default model) and the `gpt-5` agent (model pinned to gpt-5).
 */
export class CodexCliAgent implements Agent {
  readonly id: string;
  protected readonly model?: string;

  constructor(options: CodexAgentOptions = { id: "codex-cli" }) {
    this.id = options.id;
    this.model = options.model;
  }

  async prepare(context: AgentContext): Promise<void> {
    if (!(await isOnPath(CODEX_BIN, context.workspaceDir))) {
      throw new Error(
        `${CODEX_BIN} CLI not found on PATH; install the OpenAI Codex CLI before running this agent`,
      );
    }

    writeFileSync(join(context.logsDir, "agent-prompt.md"), context.prompt);
  }

  async run(context: AgentContext): Promise<AgentRunOutcome> {
    const startedMs = Date.now();
    const timeoutMs = remainingMs(context.deadlineMs, context.task.timeouts.total_seconds * 1000);
    const stdoutPath = join(context.logsDir, "agent.stdout.log");
    const stderrPath = join(context.logsDir, "agent.stderr.log");
    prepareLogFiles(stdoutPath, stderrPath);

    const cmd = [
      CODEX_BIN,
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
    ];
    if (this.model) {
      cmd.push("--model", this.model);
    }
    // Pass the prompt as a positional argument (no shell involved with the cmd
    // array form), which is the reliable cross-version way to feed `codex exec`.
    // `--` terminates option parsing so a prompt starting with "-" is still
    // treated as the prompt.
    cmd.push("--", context.prompt);

    const proc = Bun.spawn({
      cmd,
      cwd: context.workspaceDir,
      env: { ...Bun.env },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdoutDone = pipeToFile(proc.stdout, stdoutPath);
    const stderrDone = pipeToFile(proc.stderr, stderrPath);

    let timedOut = false;
    const timeout = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, timeoutMs)
      : undefined;

    const exitCode = await proc.exited;
    if (timeout) {
      clearTimeout(timeout);
    }

    await Promise.all([stdoutDone, stderrDone]);

    const durationMs = Date.now() - startedMs;
    const metrics = await parseCodexMetrics(stdoutPath);

    return {
      exitCode: timedOut ? 124 : exitCode,
      timedOut,
      durationMs,
      metrics: {
        wall_time_ms: durationMs,
        ...metrics,
      },
    };
  }

  async cleanup(_context: AgentContext): Promise<void> {
    // `codex exec` exits after the run; no persistent resources to release.
  }
}

type TokenUsage = { input?: number; output?: number };

/**
 * Parse token usage and tool-call counts from the JSONL event stream emitted by
 * `codex exec --json`. The event schema varies across Codex versions, so this
 * scans tolerantly and keeps the last cumulative usage it sees. Returns an empty
 * object when no usage is reported (metrics are best-effort, per the contract).
 */
async function parseCodexMetrics(stdoutPath: string): Promise<
  Pick<AgentRunOutcome["metrics"], "input_tokens" | "output_tokens" | "tool_calls">
> {
  try {
    const raw = await Bun.file(stdoutPath).text();
    if (!raw.trim()) {
      return {};
    }

    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let toolCalls = 0;

    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      let event: unknown;
      try {
        event = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const usage = extractUsage(event);
      if (usage.input !== undefined) inputTokens = usage.input;
      if (usage.output !== undefined) outputTokens = usage.output;

      if (isToolCallEvent(event)) {
        toolCalls += 1;
      }
    }

    const metrics: Pick<
      AgentRunOutcome["metrics"],
      "input_tokens" | "output_tokens" | "tool_calls"
    > = {};
    if (inputTokens !== undefined) metrics.input_tokens = inputTokens;
    if (outputTokens !== undefined) metrics.output_tokens = outputTokens;
    if (toolCalls > 0) metrics.tool_calls = toolCalls;
    return metrics;
  } catch {
    return {};
  }
}

/** Pull input/output token counts out of any of the known Codex event shapes. */
function extractUsage(event: unknown): TokenUsage {
  if (!isRecord(event)) {
    return {};
  }

  const msg = isRecord(event.msg) ? event.msg : undefined;
  const info = isRecord(event.info) ? event.info : undefined;
  const candidates: unknown[] = [
    event.usage,
    event.token_usage,
    msg?.usage,
    msg?.token_usage,
    info?.total_token_usage,
    info?.last_token_usage,
    event,
  ];

  let result: TokenUsage = {};
  for (const candidate of candidates) {
    if (!isRecord(candidate)) {
      continue;
    }
    const input = numberField(candidate, "input_tokens", "prompt_tokens");
    const output = numberField(candidate, "output_tokens", "completion_tokens");
    if (input !== undefined) result.input = input;
    if (output !== undefined) result.output = output;
  }
  return result;
}

function isToolCallEvent(event: unknown): boolean {
  if (!isRecord(event)) {
    return false;
  }
  const type = typeof event.type === "string"
    ? event.type
    : isRecord(event.msg) && typeof event.msg.type === "string"
      ? event.msg.type
      : undefined;
  if (!type) {
    return false;
  }
  return (
    type === "exec_command_begin" ||
    type === "patch_apply_begin" ||
    type === "mcp_tool_call_begin" ||
    type === "function_call"
  );
}

function numberField(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
