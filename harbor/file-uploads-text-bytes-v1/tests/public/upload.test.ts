import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("POST /upload", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("returns the byte count for plain text", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/upload`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "hello",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ bytes: 5 });
  });
});
