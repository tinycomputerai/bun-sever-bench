import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Shared subprocess helpers used by CLI-backed agent adapters
 * (claude-code, codex-cli, gpt-5). Keeping them in one place ensures every
 * adapter captures wall time, streams logs, and enforces the shared timeout
 * budget identically.
 */

/** Time left for a phase, bounded by both its own budget and the run deadline. */
export function remainingMs(deadlineMs: number, phaseTimeoutMs: number): number {
  const remainingTotal = Math.max(0, deadlineMs - Date.now());
  return Math.max(0, Math.min(phaseTimeoutMs, remainingTotal));
}

/** Create the log directory and truncate the per-phase log files. */
export function prepareLogFiles(stdoutPath: string, stderrPath: string): void {
  mkdirSync(dirname(stdoutPath), { recursive: true });
  writeFileSync(stdoutPath, "");
  writeFileSync(stderrPath, "");
}

/** Stream a child process output stream to a file as it is produced. */
export async function pipeToFile(
  stream: ReadableStream<Uint8Array> | null,
  filePath: string,
): Promise<void> {
  if (!stream) {
    return;
  }

  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    appendFileSync(filePath, decoder.decode(chunk, { stream: true }));
  }
  appendFileSync(filePath, decoder.decode());
}

/** Return true when `bin` resolves on PATH from the given working directory. */
export async function isOnPath(bin: string, cwd: string): Promise<boolean> {
  const proc = Bun.spawn({
    cmd: ["sh", "-c", `command -v ${bin}`],
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await proc.exited) === 0;
}
