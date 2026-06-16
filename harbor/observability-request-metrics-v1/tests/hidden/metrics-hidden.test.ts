import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

function counterValue(
  text: string,
  method: string,
  route: string,
  status: string,
): number {
  const needle = `http_requests_total{method="${method}",route="${route}",status="${status}"}`;
  for (const line of text.split("\n")) {
    if (line.startsWith(needle)) {
      const rest = line.slice(needle.length).trim();
      return Number(rest);
    }
  }
  return 0;
}

function globalLine(text: string, name: string): number {
  for (const line of text.split("\n")) {
    if (line.startsWith(name + " ")) {
      return Number(line.slice(name.length).trim());
    }
  }
  return NaN;
}

// Count how many distinct counter series exist for a given route.
function seriesForRoute(text: string, route: string): number {
  let n = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("http_requests_total{") && line.includes(`route="${route}"`)) {
      n += 1;
    }
  }
  return n;
}

async function metricsText(baseUrl: string): Promise<string> {
  return (await fetch(`${baseUrl}/metrics`)).text();
}

describe("request metrics — hidden", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("3 GET /work requests increment the GET/work/200 counter by exactly 3", async () => {
    if (!server) throw new Error("server did not start");
    const before = counterValue(await metricsText(server.baseUrl), "GET", "/work", "200");
    for (let i = 0; i < 3; i += 1) {
      await fetch(`${server.baseUrl}/work`);
    }
    const after = counterValue(await metricsText(server.baseUrl), "GET", "/work", "200");
    expect(after - before).toBe(3);
  });

  test("a 500 (GET /work?fail=1) is counted under status=500 separately from 200", async () => {
    if (!server) throw new Error("server did not start");
    const t0 = await metricsText(server.baseUrl);
    const ok0 = counterValue(t0, "GET", "/work", "200");
    const fail0 = counterValue(t0, "GET", "/work", "500");

    const r = await fetch(`${server.baseUrl}/work?fail=1`);
    expect(r.status).toBe(500);
    expect((await r.json()).error).toBe("boom");

    const t1 = await metricsText(server.baseUrl);
    expect(counterValue(t1, "GET", "/work", "500") - fail0).toBe(1);
    // The success counter must not move for a failing request.
    expect(counterValue(t1, "GET", "/work", "200")).toBe(ok0);
  });

  test("route templating: /items/1 and /items/2 form a SINGLE series with count +2", async () => {
    if (!server) throw new Error("server did not start");
    const before = counterValue(await metricsText(server.baseUrl), "GET", "/items/:id", "200");

    await fetch(`${server.baseUrl}/items/1`);
    await fetch(`${server.baseUrl}/items/2`);

    const text = await metricsText(server.baseUrl);
    expect(counterValue(text, "GET", "/items/:id", "200") - before).toBe(2);
    // Exactly one series for this route — no raw-id series like route="/items/1".
    expect(seriesForRoute(text, "/items/:id")).toBe(1);
    expect(seriesForRoute(text, "/items/1")).toBe(0);
    expect(seriesForRoute(text, "/items/2")).toBe(0);
  });

  test("GET /items/:id echoes the id in the body", async () => {
    if (!server) throw new Error("server did not start");
    const r = await fetch(`${server.baseUrl}/items/42`);
    expect(r.status).toBe(200);
    expect(String((await r.json()).id)).toBe("42");
  });

  test("unmatched routes are recorded as route=<unmatched> and return 404", async () => {
    if (!server) throw new Error("server did not start");
    const before = counterValue(await metricsText(server.baseUrl), "GET", "<unmatched>", "404");
    const r = await fetch(`${server.baseUrl}/no-such-thing`);
    expect(r.status).toBe(404);
    const after = counterValue(await metricsText(server.baseUrl), "GET", "<unmatched>", "404");
    expect(after - before).toBe(1);
  });

  test("X-Request-Id is echoed when supplied", async () => {
    if (!server) throw new Error("server did not start");
    const supplied = "trace-abc-123";
    const r = await fetch(`${server.baseUrl}/work`, { headers: { "x-request-id": supplied } });
    expect(r.headers.get("x-request-id")).toBe(supplied);
  });

  test("X-Request-Id is generated (non-empty) when not supplied, and differs per request", async () => {
    if (!server) throw new Error("server did not start");
    const a = (await fetch(`${server.baseUrl}/work`)).headers.get("x-request-id");
    const b = (await fetch(`${server.baseUrl}/work`)).headers.get("x-request-id");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
    // An empty supplied id is treated as absent → generated.
    const c = (
      await fetch(`${server.baseUrl}/work`, { headers: { "x-request-id": "   " } })
    ).headers.get("x-request-id");
    expect(c).toBeTruthy();
    expect(c!.trim().length).toBeGreaterThan(0);
  });

  test("/metrics calls do not appear in http_requests_total", async () => {
    if (!server) throw new Error("server did not start");
    // Hit /metrics several times; it must never create a counter series for itself.
    await metricsText(server.baseUrl);
    await metricsText(server.baseUrl);
    const text = await metricsText(server.baseUrl);
    expect(seriesForRoute(text, "/metrics")).toBe(0);
    expect(counterValue(text, "GET", "/metrics", "200")).toBe(0);
  });

  test("duration count increases with handled requests and excludes /metrics", async () => {
    if (!server) throw new Error("server did not start");
    const before = globalLine(await metricsText(server.baseUrl), "http_request_duration_ms_count");
    await fetch(`${server.baseUrl}/work`);
    await fetch(`${server.baseUrl}/work`);
    // Reading metrics in between must not add to the duration count.
    const after = globalLine(await metricsText(server.baseUrl), "http_request_duration_ms_count");
    expect(after - before).toBe(2);
    expect(Number.isFinite(globalLine(await metricsText(server.baseUrl), "http_request_duration_ms_sum"))).toBe(true);
  });
});
