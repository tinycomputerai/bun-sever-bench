import { createServer } from "node:net";
import { resolve } from "node:path";

export type RunningServer = {
  baseUrl: string;
  stop: () => Promise<void>;
};

const taskRoot = resolve(import.meta.dir, "../..");

export async function startTaskServer(): Promise<RunningServer> {
  const appDir = resolve(taskRoot, Bun.env.BUN_BENCH_APP_DIR ?? ".");
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const proc = Bun.spawn({
    cmd: ["bun", "run", "start"],
    cwd: appDir,
    env: { ...Bun.env, PORT: String(port) },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = collectStream(proc.stdout);
  const stderr = collectStream(proc.stderr);
  let exited = false;
  const exitedPromise = proc.exited.then(() => {
    exited = true;
  });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (exited) {
      const [stdoutText, stderrText] = await Promise.all([stdout, stderr]);
      throw new Error(`server exited before readiness\nstdout:\n${stdoutText}\nstderr:\n${stderrText}`);
    }

    try {
      await fetch(baseUrl);
      return {
        baseUrl,
        stop: async () => {
          proc.kill();
          await Promise.race([exitedPromise, sleep(1000)]);
        },
      };
    } catch {
      await sleep(50);
    }
  }

  proc.kill();
  const [stdoutText, stderrText] = await Promise.all([stdout, stderr]);
  throw new Error(`server did not become reachable\nstdout:\n${stdoutText}\nstderr:\n${stderrText}`);
}

function getAvailablePort(): Promise<number> {
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

async function collectStream(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return "";
  const decoder = new TextDecoder();
  let output = "";
  for await (const chunk of stream) {
    output += decoder.decode(chunk, { stream: true });
  }
  output += decoder.decode();
  return output;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
