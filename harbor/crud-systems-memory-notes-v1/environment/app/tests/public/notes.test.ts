import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("notes API", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("creates and lists a note", async () => {
    if (!server) throw new Error("server did not start");

    const created = await fetch(`${server.baseUrl}/notes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "first note" }),
    });
    const listed = await fetch(`${server.baseUrl}/notes`);

    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ id: "note_1", text: "first note" });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ notes: [{ id: "note_1", text: "first note" }] });
  });
});
