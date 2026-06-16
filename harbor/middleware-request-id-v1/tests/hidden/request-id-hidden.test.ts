import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("request id edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("rejects missing request id", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/request-id`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "bad_request" });
  });

  test("returns JSON for unsupported paths", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/missing`, {
      headers: { "x-request-id": "req-hidden-1" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});
