import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function hit(baseUrl: string, clientId: string, extraHeaders: Record<string, string> = {}) {
  return fetch(`${baseUrl}/resource`, {
    headers: { "x-client-id": clientId, ...extraHeaders },
  });
}

describe("distributed fairness hidden", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("concurrent burst admits at most ten", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hid-parallel";
    const results = await Promise.all(Array.from({ length: 30 }, () => hit(server.baseUrl, client)));
    const allowed = results.filter((r) => r.status === 200).length;
    expect(allowed).toBe(10);
  });

  test("two concurrent requests for the last slot do not both pass", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hid-last-slot";
    for (let i = 0; i < 9; i += 1) {
      const r = await hit(server.baseUrl, client);
      expect(r.status).toBe(200);
    }
    const pair = await Promise.all([hit(server.baseUrl, client), hit(server.baseUrl, client)]);
    const allowed = pair.filter((r) => r.status === 200).length;
    expect(allowed).toBe(1);
  });

  test("window rollover refills without double-counting", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hid-rollover";
    for (let i = 0; i < 10; i += 1) {
      expect((await hit(server.baseUrl, client)).status).toBe(200);
    }
    expect((await hit(server.baseUrl, client)).status).toBe(429);
    await sleep(1100);
    let allowed = 0;
    for (let i = 0; i < 10; i += 1) {
      if ((await hit(server.baseUrl, client)).status === 200) allowed += 1;
    }
    expect(allowed).toBe(10);
  });

  test("client clock skew header does not grant extra budget", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hid-skew";
    for (let i = 0; i < 10; i += 1) {
      await hit(server.baseUrl, client, { "x-client-time": String(Date.now() + 86_400_000) });
    }
    const blocked = await hit(server.baseUrl, client, {
      "x-client-time": String(Date.now() + 86_400_000),
    });
    expect(blocked.status).toBe(429);
  });

  test("remaining decrements across allowed requests", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hid-remaining";
    const seen: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const r = await hit(server.baseUrl, client);
      expect(r.status).toBe(200);
      seen.push(Number(r.headers.get("x-ratelimit-remaining")));
    }
    expect(seen).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  test("429 includes retry-after", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hid-retry";
    for (let i = 0; i < 10; i += 1) {
      await hit(server.baseUrl, client);
    }
    const blocked = await hit(server.baseUrl, client);
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
  });
});
