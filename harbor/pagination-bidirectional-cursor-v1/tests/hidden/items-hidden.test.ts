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

async function get(baseUrl: string, query: string) {
  const response = await fetch(`${baseUrl}/items${query}`);
  return { status: response.status, body: await response.json() };
}

describe("bidirectional pagination edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("has_prev is false on the first forward page", async () => {
    if (!server) throw new Error("server did not start");
    await createItem(server.baseUrl, "seed-a");
    await createItem(server.baseUrl, "seed-b");
    const first = await get(server.baseUrl, "?limit=2");
    expect(first.status).toBe(200);
    expect(first.body.items.length).toBeGreaterThan(0);
    // First page (no cursor) starts at the lowest id; nothing precedes it.
    expect(first.body.page_info.has_prev).toBe(false);
  });

  test("has_next is false on the last forward page", async () => {
    if (!server) throw new Error("server did not start");
    // Walk forward to the very end of the current list.
    let cursor: string | undefined;
    let last: any;
    let guard = 0;
    for (;;) {
      const q = cursor === undefined ? "?limit=5" : `?limit=5&after=${encodeURIComponent(cursor)}`;
      const page = await get(server.baseUrl, q);
      expect(page.status).toBe(200);
      last = page.body;
      if (!page.body.page_info.has_next) break;
      cursor = page.body.page_info.end_cursor;
      if (++guard > 10000) throw new Error("pagination did not terminate");
    }
    expect(last.page_info.has_next).toBe(false);
  });

  test("before cursor returns the correct slice in ascending order", async () => {
    if (!server) throw new Error("server did not start");
    const ids: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      ids.push(await createItem(server.baseUrl, `before-${i}`));
    }
    // Encode the highest id of the batch as a before cursor; expect the 3
    // items immediately below it (ids[4], ids[5], ids[6]) in ascending order.
    const cursorId = ids[7]!;
    const cursor = Buffer.from(String(cursorId), "utf8").toString("base64url");
    const page = await get(server.baseUrl, `?limit=3&before=${encodeURIComponent(cursor)}`);
    expect(page.status).toBe(200);
    const returned = page.body.items.map((it: any) => it.id);
    expect(returned).toEqual([ids[4], ids[5], ids[6]]);
    // Ascending order assertion is implicit above; also check page_info edges.
    expect(page.body.page_info.start_cursor).not.toBeNull();
    expect(page.body.page_info.end_cursor).not.toBeNull();
    // There are items below ids[4] (ids[0..3]) and above ids[6] (ids[7]).
    expect(page.body.page_info.has_prev).toBe(true);
    expect(page.body.page_info.has_next).toBe(true);
  });

  test("passing both after and before returns 400 invalid_cursor_combination", async () => {
    if (!server) throw new Error("server did not start");
    const id = await createItem(server.baseUrl, "combo");
    const cursor = Buffer.from(String(id), "utf8").toString("base64url");
    const page = await get(
      server.baseUrl,
      `?after=${encodeURIComponent(cursor)}&before=${encodeURIComponent(cursor)}`,
    );
    expect(page.status).toBe(400);
    expect(page.body.error).toBe("invalid_cursor_combination");
  });

  test("a garbage or forged cursor returns 400 invalid_cursor", async () => {
    if (!server) throw new Error("server did not start");
    const garbage = await get(server.baseUrl, "?after=!!!notbase64!!!");
    expect(garbage.status).toBe(400);
    expect(garbage.body.error).toBe("invalid_cursor");

    const forgedAfter = Buffer.from("oops", "utf8").toString("base64url");
    const forged = await get(server.baseUrl, `?before=${forgedAfter}`);
    expect(forged.status).toBe(400);
    expect(forged.body.error).toBe("invalid_cursor");
  });

  test("limit validation and clamping", async () => {
    if (!server) throw new Error("server did not start");
    const zero = await get(server.baseUrl, "?limit=0");
    expect(zero.status).toBe(400);
    expect(zero.body.error).toBe("invalid_limit");

    const neg = await get(server.baseUrl, "?limit=-3");
    expect(neg.status).toBe(400);

    const bad = await get(server.baseUrl, "?limit=ten");
    expect(bad.status).toBe(400);

    // Clamp: create enough items so >100 are available, then ask for 500.
    for (let i = 0; i < 110; i += 1) {
      await createItem(server.baseUrl, `clamp-${i}`);
    }
    const clamped = await get(server.baseUrl, "?limit=500");
    expect(clamped.status).toBe(200);
    expect(clamped.body.items.length).toBe(100);
  });

  test("has_next is correct exactly at a boundary (no off-by-one)", async () => {
    if (!server) throw new Error("server did not start");
    // Create a fresh contiguous batch and anchor paging on it via an `after`
    // cursor equal to the id just below the batch, so the batch is returned in
    // a controlled window.
    const ids: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      ids.push(await createItem(server.baseUrl, `boundary-${i}`));
    }
    // Page that ends exactly on the second-to-last created id: has_next must be
    // true because at least ids[3] (and possibly newer) exist above it.
    const afterFirst = Buffer.from(String(ids[0]!), "utf8").toString("base64url");
    const midPage = await get(server.baseUrl, `?limit=2&after=${encodeURIComponent(afterFirst)}`);
    expect(midPage.status).toBe(200);
    // items should be ids[1], ids[2]; end_cursor encodes ids[2]; ids[3] exists above.
    expect(midPage.body.items.map((it: any) => it.id)).toEqual([ids[1], ids[2]]);
    expect(midPage.body.page_info.has_next).toBe(true);

    // Page that ends exactly on the last created id with nothing newer added:
    // request the slice after ids[2]; we get ids[3] only (limit 5). has_next
    // must be false because ids[3] is currently the maximum id.
    const afterMid = Buffer.from(String(ids[2]!), "utf8").toString("base64url");
    const tailPage = await get(server.baseUrl, `?limit=5&after=${encodeURIComponent(afterMid)}`);
    expect(tailPage.status).toBe(200);
    expect(tailPage.body.items.map((it: any) => it.id)).toEqual([ids[3]]);
    expect(tailPage.body.page_info.has_next).toBe(false);
    expect(tailPage.body.page_info.has_prev).toBe(true);
  });
});
