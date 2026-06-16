import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("POST /users", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("creates a user for a valid name", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ada" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "user_1", name: "Ada" });
  });
});
