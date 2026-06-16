import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function createItem(baseUrl: string, label: string): Promise<number> {
  const response = await fetch(`${baseUrl}/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label }),
  });
  expect(response.status).toBe(201);
  return (await response.json()).id as number;
}

describe("bidirectional cursor pagination", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("creates items with monotonic ids", async () => {
    if (!server) throw new Error("server did not start");
    const a = await createItem(server.baseUrl, "a");
    const b = await createItem(server.baseUrl, "b");
    expect(b).toBe(a + 1);
  });

  test("forward paging returns ascending items with page_info", async () => {
    if (!server) throw new Error("server did not start");
    await createItem(server.baseUrl, "x");
    await createItem(server.baseUrl, "y");

    const page = await (await fetch(`${server.baseUrl}/items?limit=2`)).json();
    expect(page.items.length).toBe(2);
    expect(page.items[0].id).toBeLessThan(page.items[1].id);
    expect(typeof page.page_info.has_next).toBe("boolean");
    expect(typeof page.page_info.has_prev).toBe("boolean");
    expect(typeof page.page_info.start_cursor).toBe("string");
    expect(typeof page.page_info.end_cursor).toBe("string");

    const next = await (
      await fetch(`${server.baseUrl}/items?limit=2&after=${encodeURIComponent(page.page_info.end_cursor)}`)
    ).json();
    for (const item of next.items) {
      expect(item.id).toBeGreaterThan(page.items[page.items.length - 1].id);
    }
  });

  test("invalid body returns 422", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: 42 }),
    });
    expect(response.status).toBe(422);
  });
});
