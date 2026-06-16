import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function createItem(baseUrl: string, name: string) {
  return fetch(`${baseUrl}/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

async function listItems(baseUrl: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params);
  return fetch(`${baseUrl}/items?${query.toString()}`);
}

describe("consistent snapshot pagination public", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("creates items and lists them in sort order", async () => {
    if (!server) throw new Error("server did not start");
    await createItem(server.baseUrl, "alpha");
    await createItem(server.baseUrl, "beta");
    const page = await (await listItems(server.baseUrl, { limit: "10" })).json();
    expect(typeof page.snapshot).toBe("string");
    expect(page.items.length).toBeGreaterThanOrEqual(2);
    const names = page.items.map((i: { name: string }) => i.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  test("cursor fetches the next page without overlap", async () => {
    if (!server) throw new Error("server did not start");
    for (let i = 0; i < 5; i += 1) {
      await createItem(server.baseUrl, `page-${i}`);
    }
    const first = await (await listItems(server.baseUrl, { limit: "2" })).json();
    expect(first.next_cursor).not.toBeNull();
    const second = await (
      await listItems(server.baseUrl, {
        snapshot: first.snapshot,
        cursor: first.next_cursor,
        limit: "2",
      })
    ).json();
    const firstIds = new Set(first.items.map((i: { id: string }) => i.id));
    for (const item of second.items) {
      expect(firstIds.has(item.id)).toBe(false);
    }
  });
});
