import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Agent, AgentContext, AgentRunOutcome } from "./types";
import { isOnPath, pipeToFile, prepareLogFiles, remainingMs } from "./process";

const CLAUDE_BIN = "claude";

export class ClaudeCodeAgent implements Agent {
  readonly id = "claude-code";

  async prepare(context: AgentContext): Promise<void> {
    if (!(await isOnPath(CLAUDE_BIN, context.workspaceDir))) {
      throw new Error(
        `${CLAUDE_BIN} CLI not found on PATH; install Claude Code before running this agent`,
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

    const proc = Bun.spawn({
      cmd: [
        CLAUDE_BIN,
        "-p",
        "--dangerously-skip-permissions",
        "--output-format",
        "json",
      ],
      cwd: context.workspaceDir,
      env: { ...Bun.env },
      stdin: new Blob([context.prompt]),
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
    const metrics = await parseClaudeMetrics(stdoutPath);

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
    // Claude Code exits after -p; no persistent resources to release.
  }
}

async function parseClaudeMetrics(stdoutPath: string): Promise<
  Pick<AgentRunOutcome["metrics"], "input_tokens" | "output_tokens" | "tool_calls">
> {
  try {
    const raw = await Bun.file(stdoutPath).text();
    if (!raw.trim()) {
      return {};
    }

    const parsed = JSON.parse(raw) as {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
      };
      num_turns?: number;
    };

    return {
      input_tokens: parsed.usage?.input_tokens,
      output_tokens: parsed.usage?.output_tokens,
      tool_calls: parsed.num_turns,
    };
  } catch {
    return {};
  }
}
