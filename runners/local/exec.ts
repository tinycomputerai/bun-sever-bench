import { createServer } from "node:net";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CommandResult } from "./types";

export async function runShellCommand(options: {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  timeoutMs: number;
  stdoutPath: string;
  stderrPath: string;
}): Promise<CommandResult> {
  const started = Date.now();
  prepareLogFiles(options.stdoutPath, options.stderrPath);

  const proc = Bun.spawn({
    cmd: ["sh", "-c", options.command],
    cwd: options.cwd,
    env: { ...Bun.env, ...options.env },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutDone = pipeToFile(proc.stdout, options.stdoutPath);
  const stderrDone = pipeToFile(proc.stderr, options.stderrPath);

  let timedOut = false;
  const timeout = options.timeoutMs > 0
    ? setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, options.timeoutMs)
    : undefined;

  const exitCode = await proc.exited;
  if (timeout) {
    clearTimeout(timeout);
  }

  await Promise.all([stdoutDone, stderrDone]);

  return {
    exitCode: timedOut ? 124 : exitCode,
    timedOut,
    durationMs: Date.now() - started,
  };
}

export type ManagedProcess = {
  proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  port: number;
  stdoutPath: string;
  stderrPath: string;
  start(): Promise<void>;
  stop(): Promise<void>;
};

export async function startManagedProcess(options: {
  command: string;
  cwd: string;
  env?: Record<string, string>;
  stdoutPath: string;
  stderrPath: string;
}): Promise<ManagedProcess> {
  prepareLogFiles(options.stdoutPath, options.stderrPath);
  const port = await allocatePort();

  const proc = Bun.spawn({
    cmd: ["sh", "-c", options.command],
    cwd: options.cwd,
    env: { ...Bun.env, ...options.env, PORT: String(port) },
    stdout: "pipe",
    stderr: "pipe",
  });

  const managed: ManagedProcess = {
    proc,
    port,
    stdoutPath: options.stdoutPath,
    stderrPath: options.stderrPath,
    async start() {
      void pipeToFile(proc.stdout, options.stdoutPath);
      void pipeToFile(proc.stderr, options.stderrPath);
    },
    async stop() {
      if (proc.exitCode === null) {
        proc.kill();
      }
      await Promise.race([proc.exited, sleep(1000)]);
    },
  };

  await managed.start();
  return managed;
}

export async function waitForHttpReadiness(options: {
  port: number;
  path: string;
  expectedStatus: number;
  timeoutMs: number;
  process: ManagedProcess;
}): Promise<{ ok: true; durationMs: number } | { ok: false; reason: "exited" | "timeout"; durationMs: number }> {
  const started = Date.now();
  const url = `http://127.0.0.1:${options.port}${options.path}`;

  while (Date.now() - started < options.timeoutMs) {
    if (options.process.proc.exitCode !== null) {
      return { ok: false, reason: "exited", durationMs: Date.now() - started };
    }

    try {
      const response = await fetch(url);
      if (response.status === options.expectedStatus) {
        return { ok: true, durationMs: Date.now() - started };
      }
    } catch {
      // server not ready yet
    }

    await sleep(100);
  }

  if (options.process.proc.exitCode !== null) {
    return { ok: false, reason: "exited", durationMs: Date.now() - started };
  }

  return { ok: false, reason: "timeout", durationMs: Date.now() - started };
}

function prepareLogFiles(stdoutPath: string, stderrPath: string): void {
  mkdirSync(dirname(resolve(stdoutPath)), { recursive: true });
  writeFileSync(stdoutPath, "");
  writeFileSync(stderrPath, "");
}

async function pipeToFile(
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

function allocatePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate a TCP port"));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
