import { createServer } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export type RunningServer = { baseUrl: string; stop: () => Promise<void> };

const taskRoot = resolve(import.meta.dir, "../..");
// One database file per test-file module load. Persists across restarts within
// the same file (so persistence can be tested) but is isolated per suite run.
const dbDir = mkdtempSync(join(tmpdir(), "bun-bench-migrations-"));
const dbPath = join(dbDir, "app.db");

export async function startTaskServer(): Promise<RunningServer> {
  const appDir = resolve(taskRoot, Bun.env.BUN_BENCH_APP_DIR ?? ".");
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const proc = Bun.spawn({
    cmd: ["bun", "run", "start"],
    cwd: appDir,
    env: { ...Bun.env, PORT: String(port), DATABASE_PATH: dbPath },
    stdout: "ignore",
    stderr: "ignore",
  });
  let exited = false;
  const exitedPromise = proc.exited.then(() => {
    exited = true;
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (exited) throw new Error("server exited before readiness");
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
  throw new Error("server did not become reachable");
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
