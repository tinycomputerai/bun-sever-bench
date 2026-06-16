import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("GET /resource sliding window", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("missing X-Client-Id returns 400", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/resource`);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "missing_client_id" });
  });

  test("allows five requests then rejects the sixth", async () => {
    if (!server) throw new Error("server did not start");
    const headers = { "x-client-id": "public-basic" };

    for (let i = 0; i < 5; i += 1) {
      const ok = await fetch(`${server.baseUrl}/resource`, { headers });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ ok: true });
      expect(ok.headers.get("x-ratelimit-limit")).toBe("5");
    }

    const sixth = await fetch(`${server.baseUrl}/resource`, { headers });
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ error: "rate_limited" });
  });
});
