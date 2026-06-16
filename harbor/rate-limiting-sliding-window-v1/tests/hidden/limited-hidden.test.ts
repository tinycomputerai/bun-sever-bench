import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function hit(baseUrl: string, clientId: string) {
  return fetch(`${baseUrl}/resource`, { headers: { "x-client-id": clientId } });
}

describe("sliding window rate limit edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("five requests succeed then the sixth immediately returns 429 with a valid Retry-After", async () => {
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

  test("sliding property: 5 at once, sleep 500ms, the next is STILL 429 (a fixed window would wrongly allow it)", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hidden-sliding";
    let allowed = 0;
    for (let i = 0; i < 5; i += 1) {
      const r = await hit(server.baseUrl, client);
      if (r.status === 200) allowed += 1;
    }
    expect(allowed).toBe(5);

    // Half the window has passed. With a rolling window all five hits are still
    // within the last 1000ms, so a sixth must still be blocked. A fixed
    // calendar window that resets every 1000ms could wrongly allow it.
    await sleep(500);
    const sixth = await hit(server.baseUrl, client);
    expect(sixth.status).toBe(429);
  });

  test("after the window fully elapses the client is allowed again", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hidden-recover";
    for (let i = 0; i < 5; i += 1) {
      await hit(server.baseUrl, client);
    }
    const blocked = await hit(server.baseUrl, client);
    expect(blocked.status).toBe(429);

    // Wait comfortably longer than the 1000ms window so every prior hit ages out.
    await sleep(1200);
    const recovered = await hit(server.baseUrl, client);
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({ ok: true });
  });

  test("two different client ids have independent limits", async () => {
    if (!server) throw new Error("server did not start");
    // Exhaust client A.
    for (let i = 0; i < 5; i += 1) {
      await hit(server.baseUrl, "hidden-independent-a");
    }
    const aBlocked = await hit(server.baseUrl, "hidden-independent-a");
    expect(aBlocked.status).toBe(429);

    // A fresh client B must be unaffected.
    const bFirst = await hit(server.baseUrl, "hidden-independent-b");
    expect(bFirst.status).toBe(200);
  });

  test("X-RateLimit-Remaining decrements correctly across allowed requests", async () => {
    if (!server) throw new Error("server did not start");
    const client = "hidden-remaining";
    const seen: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await hit(server.baseUrl, client);
      expect(r.status).toBe(200);
      seen.push(Number(r.headers.get("x-ratelimit-remaining")));
    }
    expect(seen).toEqual([4, 3, 2, 1, 0]);
  });
});
