import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function createItem(baseUrl: string, name: string) {
  return fetch(`${baseUrl}/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

async function updateItem(baseUrl: string, id: string, name: string) {
  return fetch(`${baseUrl}/items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

async function deleteItem(baseUrl: string, id: string) {
  return fetch(`${baseUrl}/items/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function listItems(baseUrl: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams(params);
  return fetch(`${baseUrl}/items?${query.toString()}`);
}

describe("consistent snapshot pagination hidden", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("updated item does not duplicate across snapshot pages", async () => {
    if (!server) throw new Error("server did not start");
    const a = await (await createItem(server.baseUrl, "hid-a")).json();
    await sleep(5);
    const b = await (await createItem(server.baseUrl, "hid-b")).json();
    await sleep(5);
    const c = await (await createItem(server.baseUrl, "hid-c")).json();

    const first = await (await listItems(server.baseUrl, { limit: "2" })).json();
    expect(first.items.length).toBe(2);

    await updateItem(server.baseUrl, a.id, "hid-a-bumped");

    const second = await (
      await listItems(server.baseUrl, {
        snapshot: first.snapshot,
        cursor: first.next_cursor!,
        limit: "2",
      })
    ).json();

    const allIds = [...first.items, ...second.items].map((i: { id: string }) => i.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toContain(c.id);
    expect(allIds.filter((id: string) => id === a.id).length).toBe(1);
  });

  test("insertions after snapshot do not appear in later pages", async () => {
    if (!server) throw new Error("server did not start");
    await createItem(server.baseUrl, "hid-old-1");
    await createItem(server.baseUrl, "hid-old-2");
    const first = await (await listItems(server.baseUrl, { limit: "1" })).json();
    await createItem(server.baseUrl, "hid-new-insert");
    const second = await (
      await listItems(server.baseUrl, {
        snapshot: first.snapshot,
        cursor: first.next_cursor!,
        limit: "10",
      })
    ).json();
    const names = second.items.map((i: { name: string }) => i.name);
    expect(names).not.toContain("hid-new-insert");
  });

  test("cursor remains valid when anchor item is deleted", async () => {
    if (!server) throw new Error("server did not start");
    await createItem(server.baseUrl, "hid-del-1");
    const middle = await (await createItem(server.baseUrl, "hid-del-2")).json();
    await createItem(server.baseUrl, "hid-del-3");
    const first = await (await listItems(server.baseUrl, { limit: "1" })).json();
    await deleteItem(server.baseUrl, middle.id);
    const second = await (
      await listItems(server.baseUrl, {
        snapshot: first.snapshot,
        cursor: first.next_cursor!,
        limit: "10",
      })
    ).json();
    expect(second.items.length).toBeGreaterThan(0);
  });

  test("cursor from wrong snapshot is rejected", async () => {
    if (!server) throw new Error("server did not start");
    const pageA = await (await listItems(server.baseUrl, { limit: "1" })).json();
    const pageB = await (await listItems(server.baseUrl, { limit: "1" })).json();
    const response = await listItems(server.baseUrl, {
      snapshot: pageB.snapshot,
      cursor: pageA.next_cursor!,
      limit: "1",
    });
    expect(response.status).toBe(400);
  });

  test("garbage cursor is rejected", async () => {
    if (!server) throw new Error("server did not start");
    const page = await (await listItems(server.baseUrl, { limit: "1" })).json();
    const response = await listItems(server.baseUrl, {
      snapshot: page.snapshot,
      cursor: "not-a-valid-cursor",
      limit: "1",
    });
    expect(response.status).toBe(400);
  });
});
