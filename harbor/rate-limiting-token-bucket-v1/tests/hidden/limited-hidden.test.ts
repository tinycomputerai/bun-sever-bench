import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function hit(baseUrl: string, clientId: string) {
  return fetch(`${baseUrl}/resource`, { headers: { "x-client-id": clientId } });
}

async function drain(baseUrl: string, clientId: string): Promise<void> {
  // Spend the full initial bucket of five tokens.
  for (let i = 0; i < 5; i += 1) {
    await hit(baseUrl, clientId);
  }
}

describe("token bucket rate limit edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("initial burst of five succeeds and the sixth returns 429 with a valid Retry-After", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hidden-burst";
    let allowed = 0;
    for (let i = 0; i < 5; i += 1) {
      const r = await hit(server.baseUrl, client);
      if (r.status === 200) allowed += 1;
    }
    expect(allowed).toBe(5);

    const blocked = await hit(server.baseUrl, client);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ error: "rate_limited" });
    expect(blocked.headers.get("x-ratelimit-remaining")).toBe("0");
    const retryAfter = Number(blocked.headers.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
  });

  test("after draining, ~650ms refills roughly three tokens (at least 3, clearly fewer than 5 succeed)", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hidden-refill";
    await drain(server.baseUrl, client);

    // 650ms / 200ms-per-token = 3.25 tokens accrued, capped well below 5.
    await sleep(650);

    let allowed = 0;
    for (let i = 0; i < 5; i += 1) {
      const r = await hit(server.baseUrl, client);
      if (r.status === 200) allowed += 1;
    }
    expect(allowed).toBeGreaterThanOrEqual(3);
    expect(allowed).toBeLessThan(5);
  });

  test("capacity cap: drain, sleep ~2000ms (would refill 10 if uncapped), then only five succeed", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hidden-cap";
    await drain(server.baseUrl, client);

    // 2000ms / 200ms = 10 tokens would accrue if uncapped, but capacity is 5.
    await sleep(2000);

    let allowed = 0;
    for (let i = 0; i < 7; i += 1) {
      const r = await hit(server.baseUrl, client);
      if (r.status === 200) allowed += 1;
    }
    expect(allowed).toBe(5);

    const extra = await hit(server.baseUrl, client);
    expect(extra.status).toBe(429);
  });

  test("different clients have independent buckets", async () => {
    if (!server) throw new Error("server did not start");
    await drain(server.baseUrl, "hidden-independent-a");
    const aBlocked = await hit(server.baseUrl, "hidden-independent-a");
    expect(aBlocked.status).toBe(429);

    const bFirst = await hit(server.baseUrl, "hidden-independent-b");
    expect(bFirst.status).toBe(200);
  });

  test("X-RateLimit-Remaining floors the token count on allowed requests", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hidden-remaining";
    const seen: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await hit(server.baseUrl, client);
      expect(r.status).toBe(200);
      seen.push(Number(r.headers.get("x-ratelimit-remaining")));
    }
    // Starting full at 5, each request consumes one whole token with negligible
    // refill across an in-process burst, so the floored remaining counts down.
    expect(seen).toEqual([4, 3, 2, 1, 0]);
  });
});
