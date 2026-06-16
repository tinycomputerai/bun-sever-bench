import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

const TERMINAL = new Set(["succeeded", "dead_letter"]);

async function createJob(baseUrl: string, type: string) {
  const response = await fetch(`${baseUrl}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type }),
  });
  return { response, body: await response.json() };
}

async function pollUntilTerminal(baseUrl: string, id: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await (await fetch(`${baseUrl}/jobs/${id}`)).json();
    if (TERMINAL.has(job.status)) return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("job did not reach a terminal state in time");
}

describe("retry-queue job lifecycle", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("POST /jobs creates a queued job at attempts 0", async () => {
    if (!server) throw new Error("server did not start");
    const { response, body } = await createJob(server.baseUrl, "ok");
    expect(response.status).toBe(201);
    expect(typeof body.id).toBe("string");
    expect(body.status).toBe("queued");
    expect(body.attempts).toBe(0);
    expect(body.max_attempts).toBe(3);
  });

  test("an ok job eventually succeeds", async () => {
    if (!server) throw new Error("server did not start");
    const { body } = await createJob(server.baseUrl, "ok");
    const job = await pollUntilTerminal(server.baseUrl, body.id);
    expect(job.status).toBe("succeeded");
    expect(job.attempts).toBe(1);
  });

  test("GET on an unknown id returns 404", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/jobs/nonexistent`);
    expect(response.status).toBe(404);
  });
});
