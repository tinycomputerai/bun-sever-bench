import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("safe error edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("does not expose stack traces", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/boom`);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain("stack");
    expect(JSON.parse(text)).toEqual({ error: "internal_error" });
  });

  test("returns JSON for unknown routes", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/missing`);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
