import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("notes edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("rejects blank note text", async () => {
    if (!server) throw new Error("server did not start");

    const response = await fetch(`${server.baseUrl}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "  " }),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "invalid_text" });
  });

  test("increments ids and preserves insertion order", async () => {
    if (!server) throw new Error("server did not start");

    await fetch(`${server.baseUrl}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "alpha" }) });
    await fetch(`${server.baseUrl}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "beta" }) });
    const response = await fetch(`${server.baseUrl}/notes`);

    expect(await response.json()).toEqual({
      notes: [
        { id: "note_1", text: "alpha" },
        { id: "note_2", text: "beta" },
      ],
    });
  });
});
