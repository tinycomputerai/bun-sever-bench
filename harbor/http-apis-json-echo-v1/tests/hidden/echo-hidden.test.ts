import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("JSON echo edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("rejects malformed JSON", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_json" });
  });

  test("returns JSON for unsupported methods", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/echo`);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
