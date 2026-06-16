import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("health endpoint edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("ignores query parameters and returns only the ok flag", async () => {
    if (!server) {
      throw new Error("server did not start");
    }

    const probe = encodeURIComponent(`probe-${Date.now()}`);
    const response = await fetch(`${server.baseUrl}/health?probe=${probe}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("does not report unsupported methods as healthy", async () => {
    if (!server) {
      throw new Error("server did not start");
    }

    const response = await fetch(`${server.baseUrl}/health`, { method: "POST" });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
