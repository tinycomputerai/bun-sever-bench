import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function compute(baseUrl: string, key: string) {
  return fetch(`${baseUrl}/compute/${encodeURIComponent(key)}`);
}

async function stats(baseUrl: string) {
  return (await fetch(`${baseUrl}/stats`)).json();
}

describe("cache stampede public", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("first miss computes, second hit is cached", async () => {
    if (!server) throw new Error("server did not start");
    const key = "pub-alpha";
    const first = await compute(server.baseUrl, key);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.cached).toBe(false);
    expect(typeof firstBody.value).toBe("string");

    const second = await compute(server.baseUrl, key);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.cached).toBe(true);
    expect(secondBody.value).toBe(firstBody.value);

    const counts = (await stats(server.baseUrl)).invocations;
    expect(counts[key]).toBe(1);
  });

  test("distinct keys are isolated", async () => {
    if (!server) throw new Error("server did not start");
    const a = await (await compute(server.baseUrl, "pub-key-a")).json();
    const b = await (await compute(server.baseUrl, "pub-key-b")).json();
    expect(a.value).not.toBe(b.value);
  });

  test("fail- keys return compute_failed", async () => {
    if (!server) throw new Error("server did not start");
    const response = await compute(server.baseUrl, "fail-pub");
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("compute_failed");
  });
});
