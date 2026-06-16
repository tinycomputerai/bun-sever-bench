import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function setMode(baseUrl: string, mode: string) {
  return fetch(`${baseUrl}/dependency`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode }),
  });
}

async function breaker(baseUrl: string) {
  return (await fetch(`${baseUrl}/breaker`)).json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Drive the breaker open by issuing `n` failing POST /call requests (each is one
// consecutive failure, +1 dependency call). Returns nothing; caller inspects.
async function failPostCalls(baseUrl: string, n: number) {
  for (let i = 0; i < n; i += 1) {
    await fetch(`${baseUrl}/call`, { method: "POST" });
  }
}

describe("circuit breaker — state machine", () => {
  let server: RunningServer | undefined;

  beforeEach(async () => {
    server = await startTaskServer();
  });

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  test("each failed /call counts as one consecutive failure (per-request, not per-attempt)", async () => {
    if (!server) throw new Error("server did not start");
    await setMode(server.baseUrl, "down");
    // One failed GET /call = 3 invocations but exactly 1 consecutive failure.
    await fetch(`${server.baseUrl}/call`);
    const b = await breaker(server.baseUrl);
    expect(b.consecutive_failures).toBe(1);
    expect(b.dependency_calls).toBe(3);
    expect(b.state).toBe("closed");
  });

  test("a success resets the consecutive-failure count", async () => {
    if (!server) throw new Error("server did not start");
    await setMode(server.baseUrl, "down");
    await failPostCalls(server.baseUrl, 3);
    expect((await breaker(server.baseUrl)).consecutive_failures).toBe(3);
    await setMode(server.baseUrl, "up");
    const ok = await fetch(`${server.baseUrl}/call`, { method: "POST" });
    expect(ok.status).toBe(200);
    expect((await breaker(server.baseUrl)).consecutive_failures).toBe(0);
  });

  test("5 consecutive failed calls drive the breaker to open", async () => {
    if (!server) throw new Error("server did not start");
    await setMode(server.baseUrl, "down");
    await failPostCalls(server.baseUrl, 5);
    const b = await breaker(server.baseUrl);
    expect(b.state).toBe("open");
    expect(b.consecutive_failures).toBeGreaterThanOrEqual(5);
  });

  test("while OPEN a /call returns 503 fast and does NOT invoke the dependency", async () => {
    if (!server) throw new Error("server did not start");
    await setMode(server.baseUrl, "down");
    await failPostCalls(server.baseUrl, 5);
    const opened = await breaker(server.baseUrl);
    expect(opened.state).toBe("open");
    const callsBefore = opened.dependency_calls;

    // Even a GET (which would normally retry 3x) must not touch the dependency.
    const getResp = await fetch(`${server.baseUrl}/call`);
    expect(getResp.status).toBe(503);
    expect((await getResp.json()).error).toBe("circuit_open");

    const postResp = await fetch(`${server.baseUrl}/call`, { method: "POST" });
    expect(postResp.status).toBe(503);
    expect((await postResp.json()).error).toBe("circuit_open");

    expect((await breaker(server.baseUrl)).dependency_calls).toBe(callsBefore);
  });

  test("after cooldown with mode up, a /call succeeds and the breaker closes with failures reset", async () => {
    if (!server) throw new Error("server did not start");
    await setMode(server.baseUrl, "down");
    await failPostCalls(server.baseUrl, 5);
    expect((await breaker(server.baseUrl)).state).toBe("open");

    // Wait past the ~500ms cooldown (tolerant).
    await sleep(700);
    await setMode(server.baseUrl, "up");

    const trial = await fetch(`${server.baseUrl}/call`, { method: "POST" });
    expect(trial.status).toBe(200);
    const b = await breaker(server.baseUrl);
    expect(b.state).toBe("closed");
    expect(b.consecutive_failures).toBe(0);
  });

  test("a failed half-open trial reopens the breaker (no permanent close)", async () => {
    if (!server) throw new Error("server did not start");
    await setMode(server.baseUrl, "down");
    await failPostCalls(server.baseUrl, 5);
    expect((await breaker(server.baseUrl)).state).toBe("open");

    await sleep(700);
    // Still down: the half-open trial call fails and must reopen.
    const trial = await fetch(`${server.baseUrl}/call`, { method: "POST" });
    expect(trial.status).toBe(502);
    expect((await breaker(server.baseUrl)).state).toBe("open");

    // And it should fail fast again immediately afterwards.
    const fast = await fetch(`${server.baseUrl}/call`, { method: "POST" });
    expect(fast.status).toBe(503);
  });

  test("invalid mode is rejected with 400 and leaves the current mode intact", async () => {
    if (!server) throw new Error("server did not start");
    const bad = await setMode(server.baseUrl, "sideways");
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("invalid_mode");
    // Default mode is still "up": a call succeeds.
    const ok = await fetch(`${server.baseUrl}/call`);
    expect(ok.status).toBe(200);
  });

  test("flaky mode fails calls until the mode is changed back to up", async () => {
    if (!server) throw new Error("server did not start");
    await setMode(server.baseUrl, "flaky");
    const failed = await fetch(`${server.baseUrl}/call`, { method: "POST" });
    expect(failed.status).toBe(502);
    await setMode(server.baseUrl, "up");
    const ok = await fetch(`${server.baseUrl}/call`, { method: "POST" });
    expect(ok.status).toBe(200);
  });

  test("GET /call returns the succeeding attempt number when the dependency recovers", async () => {
    if (!server) throw new Error("server did not start");
    // mode up from start: a GET should succeed on the first attempt.
    const resp = await fetch(`${server.baseUrl}/call`);
    expect(resp.status).toBe(200);
    expect((await resp.json()).attempts).toBe(1);
  });
});
