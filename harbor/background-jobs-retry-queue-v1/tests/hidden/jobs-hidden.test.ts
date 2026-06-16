import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

const TERMINAL = new Set(["succeeded", "dead_letter"]);
const VALID_STATUS = new Set(["queued", "running", "retrying", "succeeded", "dead_letter"]);

async function createJob(baseUrl: string, type: string) {
  const response = await fetch(`${baseUrl}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type }),
  });
  return { response, body: await response.json() };
}

async function getJob(baseUrl: string, id: string) {
  return (await fetch(`${baseUrl}/jobs/${id}`)).json();
}

async function pollUntilTerminal(baseUrl: string, id: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getJob(baseUrl, id);
    if (TERMINAL.has(job.status)) return job;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("job did not reach a terminal state in time");
}

describe("retry-queue edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("processing is asynchronous: POST response is queued, not already terminal", async () => {
    if (!server) throw new Error("server did not start");
    const { response, body } = await createJob(server.baseUrl, "ok");
    expect(response.status).toBe(201);
    // The POST itself must report queued. If it processed synchronously it
    // would already be "succeeded" here.
    expect(body.status).toBe("queued");
    expect(body.attempts).toBe(0);
  });

  test("an ok job succeeds with attempts == 1", async () => {
    if (!server) throw new Error("server did not start");
    const { body } = await createJob(server.baseUrl, "ok");
    const job = await pollUntilTerminal(server.baseUrl, body.id);
    expect(job.status).toBe("succeeded");
    expect(job.attempts).toBe(1);
  });

  test("a fail job dead-letters with attempts == 3 and a last_error", async () => {
    if (!server) throw new Error("server did not start");
    const { body } = await createJob(server.baseUrl, "fail");
    const job = await pollUntilTerminal(server.baseUrl, body.id);
    expect(job.status).toBe("dead_letter");
    expect(job.attempts).toBe(3);
    expect(typeof job.last_error).toBe("string");
    expect(job.last_error.length).toBeGreaterThan(0);
  });

  test("a flaky job succeeds on attempt 3 (proves real retry, not give-up)", async () => {
    if (!server) throw new Error("server did not start");
    const { body } = await createJob(server.baseUrl, "flaky");
    const job = await pollUntilTerminal(server.baseUrl, body.id);
    expect(job.status).toBe("succeeded");
    expect(job.attempts).toBe(3);
  });

  test("dead_letter is terminal and sticks; attempts never exceed max_attempts", async () => {
    if (!server) throw new Error("server did not start");
    const { body } = await createJob(server.baseUrl, "fail");
    const job = await pollUntilTerminal(server.baseUrl, body.id);
    expect(job.status).toBe("dead_letter");
    expect(job.attempts).toBe(3);

    // Poll several more times well past any backoff window; nothing must change.
    for (let i = 0; i < 6; i += 1) {
      await new Promise((r) => setTimeout(r, 30));
      const again = await getJob(server.baseUrl, body.id);
      expect(again.status).toBe("dead_letter");
      expect(again.attempts).toBe(3);
      expect(again.attempts).toBeLessThanOrEqual(again.max_attempts);
    }
  });

  test("status is always a valid state-machine value while processing", async () => {
    if (!server) throw new Error("server did not start");
    const { body } = await createJob(server.baseUrl, "flaky");
    const deadline = Date.now() + 5000;
    let sawTerminal = false;
    while (Date.now() < deadline) {
      const job = await getJob(server.baseUrl, body.id);
      expect(VALID_STATUS.has(job.status)).toBe(true);
      expect(job.attempts).toBeLessThanOrEqual(job.max_attempts);
      if (TERMINAL.has(job.status)) {
        sawTerminal = true;
        break;
      }
    }
    expect(sawTerminal).toBe(true);
  });

  test("unknown type is treated as failing and dead-letters", async () => {
    if (!server) throw new Error("server did not start");
    const { body } = await createJob(server.baseUrl, "totally-unknown-type");
    const job = await pollUntilTerminal(server.baseUrl, body.id);
    expect(job.status).toBe("dead_letter");
    expect(job.attempts).toBe(3);
  });

  test("invalid JSON is a 400 and missing type is a 422", async () => {
    if (!server) throw new Error("server did not start");
    const bad = await fetch(`${server.baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(bad.status).toBe(400);

    const missing = await fetch(`${server.baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { a: 1 } }),
    });
    expect(missing.status).toBe(422);
  });

  test("GET /jobs/nonexistent returns 404", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/jobs/nonexistent`);
    expect(response.status).toBe(404);
  });

  test("a succeeded ok job exposes the expected shape", async () => {
    if (!server) throw new Error("server did not start");
    const { body } = await createJob(server.baseUrl, "ok");
    const job = await pollUntilTerminal(server.baseUrl, body.id);
    expect(job.id).toBe(body.id);
    expect(job.type).toBe("ok");
    expect(job.status).toBe("succeeded");
    expect(job.attempts).toBe(1);
    expect(job.max_attempts).toBe(3);
  });
});
