import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("GET /request-id", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("echoes the request id in the body and response header", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/request-id`, {
      headers: { "x-request-id": "req-public-1" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req-public-1");
    expect(await response.json()).toEqual({ requestId: "req-public-1" });
  });
});
