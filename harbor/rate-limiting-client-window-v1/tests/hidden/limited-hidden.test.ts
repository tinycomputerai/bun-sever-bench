import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("rate limit edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("rejects the third request from the same client", async () => {
    if (!server) throw new Error("server did not start");

    const headers = { "x-client-id": "client-hidden-limit" };
    await fetch(`${server.baseUrl}/limited`, { headers });
    await fetch(`${server.baseUrl}/limited`, { headers });
    const third = await fetch(`${server.baseUrl}/limited`, { headers });

    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: "rate_limited" });
  });

  test("keeps separate counters for different clients", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/limited`, {
      headers: { "x-client-id": "client-hidden-fresh" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, remaining: 1 });
  });
});
