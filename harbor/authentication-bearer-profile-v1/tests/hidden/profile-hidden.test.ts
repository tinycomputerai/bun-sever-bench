import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("profile authentication edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("rejects missing authorization", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/profile`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("rejects an invalid bearer token", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/profile`, {
      headers: { authorization: "Bearer wrong-token" },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });
});
