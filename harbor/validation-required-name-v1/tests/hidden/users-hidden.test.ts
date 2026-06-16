import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("user validation edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("rejects a missing name", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_name" });
  });

  test("rejects a blank name", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_name" });
  });
});
