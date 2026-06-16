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

describe("circuit breaker — basics", () => {
  let server: RunningServer | undefined;

  // Fresh server per test so breaker/dependency state never leaks between tests.
  beforeEach(async () => {
    server = await startTaskServer();
  });

  afterEach(async () => {
    await server?.stop();
    server = undefined;
  });

  test("GET /breaker reports the initial closed state", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/breaker`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.state).toBe("closed");
    expect(body.consecutive_failures).toBe(0);
    expect(body.dependency_calls).toBe(0);
  });

  test("GET /call succeeds in mode up with attempts 1", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/call`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.attempts).toBe(1);
    expect((await breaker(server.baseUrl)).dependency_calls).toBe(1);
  });

  test("POST /dependency sets the mode and is echoed back", async () => {
    if (!server) throw new Error("server did not start");
    const response = await setMode(server.baseUrl, "down");
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("down");
  });

  test("GET /call with mode down retries and reports attempts 3 then 502", async () => {
    if (!server) throw new Error("server did not start");
    await setMode(server.baseUrl, "down");
    const before = (await breaker(server.baseUrl)).dependency_calls;
    const response = await fetch(`${server.baseUrl}/call`);
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("upstream_failed");
    expect(body.attempts).toBe(3);
    const after = (await breaker(server.baseUrl)).dependency_calls;
    expect(after - before).toBe(3);
  });

  test("POST /call with mode down is NOT retried (attempts 1, +1 invocation)", async () => {
    if (!server) throw new Error("server did not start");
    await setMode(server.baseUrl, "down");
    const before = (await breaker(server.baseUrl)).dependency_calls;
    const response = await fetch(`${server.baseUrl}/call`, { method: "POST" });
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.attempts).toBe(1);
    const after = (await breaker(server.baseUrl)).dependency_calls;
    expect(after - before).toBe(1);
  });
});
