import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function compute(baseUrl: string, key: string) {
  return fetch(`${baseUrl}/compute/${encodeURIComponent(key)}`);
}

async function stats(baseUrl: string) {
  return (await fetch(`${baseUrl}/stats`)).json();
}

describe("cache stampede hidden", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("concurrent misses invoke compute exactly once", async () => {
    if (!server) throw new Error("server did not start");
    const key = "hid-stampede";
    const results = await Promise.all(
      Array.from({ length: 25 }, () => compute(server.baseUrl, key)),
    );
    const values = new Set(
      (
        await Promise.all(
          results.map(async (r) => {
            expect(r.status).toBe(200);
            return (await r.json()).value;
          }),
        )
      ),
    );
    expect(values.size).toBe(1);
    expect((await stats(server.baseUrl)).invocations[key]).toBe(1);
  });

  test("stampede on key A does not block key B", async () => {
    if (!server) throw new Error("server did not start");
    const [aResults, bResult] = await Promise.all([
      Promise.all(Array.from({ length: 10 }, () => compute(server.baseUrl, "hid-block-a"))),
      compute(server.baseUrl, "hid-block-b"),
    ]);
    expect(bResult.status).toBe(200);
    for (const r of aResults) {
      expect(r.status).toBe(200);
    }
    const counts = (await stats(server.baseUrl)).invocations;
    expect(counts["hid-block-a"]).toBe(1);
    expect(counts["hid-block-b"]).toBe(1);
  });

  test("stale-while-revalidate serves stale immediately with one background refresh", async () => {
    if (!server) throw new Error("server did not start");
    const key = "hid-swr";
    await compute(server.baseUrl, key);
    await sleep(350);
    const swr = await compute(server.baseUrl, key);
    expect(swr.status).toBe(200);
    expect((await swr.json()).cached).toBe(true);
    await sleep(120);
    expect((await stats(server.baseUrl)).invocations[key]).toBe(2);
  });

  test("negative cache expires and allows recovery", async () => {
    if (!server) throw new Error("server did not start");
    const key = "fail-recover";
    const first = await compute(server.baseUrl, key);
    expect(first.status).toBe(503);
    const second = await compute(server.baseUrl, key);
    expect(second.status).toBe(503);
    expect((await stats(server.baseUrl)).invocations[key]).toBe(1);

    await sleep(200);
    const third = await compute(server.baseUrl, key);
    expect(third.status).toBe(503);
    expect((await stats(server.baseUrl)).invocations[key]).toBe(2);
  });

  test("bounded cache evicts oldest entries without unbounded growth", async () => {
    if (!server) throw new Error("server did not start");
    for (let i = 0; i < 22; i += 1) {
      await compute(server.baseUrl, `hid-evict-${i}`);
    }
    const first = await compute(server.baseUrl, "hid-evict-0");
    expect(first.status).toBe(200);
    expect((await stats(server.baseUrl)).invocations["hid-evict-0"]).toBe(2);
  });
});
