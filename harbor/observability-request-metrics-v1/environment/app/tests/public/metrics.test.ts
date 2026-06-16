import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

function counterValue(
  text: string,
  method: string,
  route: string,
  status: string,
): number | undefined {
  const needle = `http_requests_total{method="${method}",route="${route}",status="${status}"}`;
  for (const line of text.split("\n")) {
    if (line.startsWith(needle)) {
      const rest = line.slice(needle.length).trim();
      return Number(rest);
    }
  }
  return undefined;
}

describe("request metrics", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("GET /work returns 200 {ok:true}", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/work`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("GET /metrics is 200 text/plain Prometheus exposition", async () => {
    if (!server) throw new Error("server did not start");
    await fetch(`${server.baseUrl}/work`);
    const response = await fetch(`${server.baseUrl}/metrics`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    expect(text).toContain("http_request_duration_ms_count ");
    expect(text).toContain("http_request_duration_ms_sum ");
    expect(counterValue(text, "GET", "/work", "200")).toBeGreaterThanOrEqual(1);
  });

  test("every response carries an X-Request-Id header", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/work`);
    const id = response.headers.get("x-request-id");
    expect(id).toBeTruthy();
    expect(id!.length).toBeGreaterThan(0);
  });
});
