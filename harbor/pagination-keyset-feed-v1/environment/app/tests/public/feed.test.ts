import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function createEvent(baseUrl: string, message: string) {
  const response = await fetch(`${baseUrl}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return response;
}

describe("keyset event feed", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("creates an event with a monotonic id and created_at", async () => {
    if (!server) throw new Error("server did not start");
    const first = await createEvent(server.baseUrl, "alpha");
    expect(first.status).toBe(201);
    const a = await first.json();
    expect(typeof a.id).toBe("number");
    expect(a.message).toBe("alpha");
    expect(typeof a.created_at).toBe("number");

    const second = await createEvent(server.baseUrl, "beta");
    const b = await second.json();
    expect(b.id).toBe(a.id + 1);
  });

  test("returns items newest-first with a next_cursor when paging", async () => {
    if (!server) throw new Error("server did not start");
    const created: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      created.push((await (await createEvent(server.baseUrl, `m${i}`)).json()).id);
    }

    const page = await (await fetch(`${server.baseUrl}/events?limit=2`)).json();
    expect(page.items.length).toBe(2);
    // newest first: descending ids
    expect(page.items[0].id).toBeGreaterThan(page.items[1].id);
    expect(typeof page.next_cursor).toBe("string");

    const next = await (
      await fetch(`${server.baseUrl}/events?limit=2&cursor=${encodeURIComponent(page.next_cursor)}`)
    ).json();
    // All ids on the next page are strictly less than the last id of page 1.
    const boundary = page.items[page.items.length - 1].id;
    for (const item of next.items) {
      expect(item.id).toBeLessThan(boundary);
    }
  });

  test("invalid body returns 422", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: 123 }),
    });
    expect(response.status).toBe(422);
  });
});
