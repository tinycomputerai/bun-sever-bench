import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("GET /limited", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("allows two requests from one client", async () => {
    if (!server) throw new Error("server did not start");

    const headers = { "x-client-id": "client-public" };
    const first = await fetch(`${server.baseUrl}/limited`, { headers });
    const second = await fetch(`${server.baseUrl}/limited`, { headers });

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, remaining: 1 });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, remaining: 0 });
  });
});
