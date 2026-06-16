import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("GET /profile", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("returns a profile for the valid bearer token", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/profile`, {
      headers: { authorization: "Bearer benchmark-token" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "user_1", email: "user@example.com" });
  });
});
