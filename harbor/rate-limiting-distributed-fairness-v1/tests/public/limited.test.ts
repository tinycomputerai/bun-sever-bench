import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function hit(baseUrl: string, clientId: string, extraHeaders: Record<string, string> = {}) {
  return fetch(`${baseUrl}/resource`, {
    headers: { "x-client-id": clientId, ...extraHeaders },
  });
}

describe("distributed fairness public", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("allows requests under the limit with rate limit headers", async () => {
    if (!server) throw new Error("server did not start");
    const response = await hit(server.baseUrl, "pub-client");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-ratelimit-limit")).toBe("10");
    expect(Number(response.headers.get("x-ratelimit-remaining"))).toBeGreaterThanOrEqual(0);
  });

  test("eleventh immediate request returns 429", async () => {
    if (!server) throw new Error("server did not start");
    const client = "pub-burst";
    let allowed = 0;
    for (let i = 0; i < 11; i += 1) {
      const r = await hit(server.baseUrl, client);
      if (r.status === 200) allowed += 1;
    }
    expect(allowed).toBe(10);
  });

  test("different clients have independent budgets", async () => {
    if (!server) throw new Error("server did not start");
    for (let i = 0; i < 10; i += 1) {
      await hit(server.baseUrl, "pub-a");
    }
    const blocked = await hit(server.baseUrl, "pub-a");
    expect(blocked.status).toBe(429);
    const other = await hit(server.baseUrl, "pub-b");
    expect(other.status).toBe(200);
  });
});
