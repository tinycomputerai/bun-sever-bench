import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("text upload edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("counts UTF-8 bytes", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/upload`, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: "cafe",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bytes: 4 });
  });

  test("rejects non-text content types", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/upload`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported_media_type" });
  });
});
