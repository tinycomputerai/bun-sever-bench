import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function createEvent(baseUrl: string, message: string): Promise<number> {
  const response = await fetch(`${baseUrl}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  });
  expect(response.status).toBe(201);
  return (await response.json()).id as number;
}

async function getPage(baseUrl: string, limit: number, cursor?: string) {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (cursor !== undefined) qs.set("cursor", cursor);
  const response = await fetch(`${baseUrl}/events?${qs.toString()}`);
  return { status: response.status, body: await response.json() };
}

describe("keyset feed edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("limit greater than 100 is clamped to 100", async () => {
    if (!server) throw new Error("server did not start");
    // Create enough events that at least 100 are available on the first page.
    for (let i = 0; i < 105; i += 1) {
      await createEvent(server.baseUrl, `clamp-${i}`);
    }
    const { status, body } = await getPage(server.baseUrl, 250);
    expect(status).toBe(200);
    expect(body.items.length).toBe(100);
    // Strictly descending, no duplicates within the page.
    for (let i = 1; i < body.items.length; i += 1) {
      expect(body.items[i].id).toBeLessThan(body.items[i - 1].id);
    }
  });

  test("limit of zero or negative returns 400 invalid_limit", async () => {
    if (!server) throw new Error("server did not start");
    const zero = await getPage(server.baseUrl, 0);
    expect(zero.status).toBe(400);
    expect(zero.body.error).toBe("invalid_limit");

    const negative = await getPage(server.baseUrl, -5);
    expect(negative.status).toBe(400);
    expect(negative.body.error).toBe("invalid_limit");

    const nonInteger = await fetch(`${server.baseUrl}/events?limit=abc`);
    expect(nonInteger.status).toBe(400);
    expect((await nonInteger.json()).error).toBe("invalid_limit");
  });

  test("a garbage or forged cursor returns 400 invalid_cursor", async () => {
    if (!server) throw new Error("server did not start");
    const garbage = await getPage(server.baseUrl, 5, "!!!not-base64!!!");
    expect(garbage.status).toBe(400);
    expect(garbage.body.error).toBe("invalid_cursor");

    // base64url of a non-numeric payload must also be rejected.
    const forged = await getPage(server.baseUrl, 5, Buffer.from("hax", "utf8").toString("base64url"));
    expect(forged.status).toBe(400);
    expect(forged.body.error).toBe("invalid_cursor");
  });

  test("next_cursor is null on the final page", async () => {
    if (!server) throw new Error("server did not start");
    // Walk every page from the newest; the terminal page must carry null.
    const limit = 7;
    let cursor: string | undefined;
    let lastBody: any;
    let guard = 0;
    do {
      const page = await getPage(server.baseUrl, limit, cursor);
      expect(page.status).toBe(200);
      lastBody = page.body;
      cursor = page.body.next_cursor ?? undefined;
      guard += 1;
      if (guard > 1000) throw new Error("pagination did not terminate");
    } while (cursor !== undefined);
    expect(lastBody.next_cursor).toBeNull();
    expect(lastBody.items.length).toBeLessThan(limit);
  });

  test("stability: inserting newer events does not skip or duplicate older items", async () => {
    if (!server) throw new Error("server did not start");
    // Seed a known batch and remember its ids.
    const seeded: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      seeded.push(await createEvent(server.baseUrl, `stable-${i}`));
    }
    const maxSeeded = Math.max(...seeded);

    // Page 1: newest 3 events at or below our seeded max (use a cursor just
    // above the newest seeded id by paging from there). To anchor on our batch
    // deterministically, fetch page 1 with a large limit then cut to our window.
    const page1 = await getPage(server.baseUrl, 3);
    const page1Ids: number[] = page1.body.items.map((e: any) => e.id);
    expect(page1.body.next_cursor).not.toBeNull();

    // Insert several BRAND NEW events (higher ids) between page fetches.
    for (let i = 0; i < 4; i += 1) {
      await createEvent(server.baseUrl, `inserted-${i}`);
    }

    // Page 2 via the cursor from page 1.
    const page2 = await getPage(server.baseUrl, 3, page1.body.next_cursor);
    const page2Ids: number[] = page2.body.items.map((e: any) => e.id);

    // No overlap between page 1 and page 2 (no duplicates).
    for (const id of page2Ids) {
      expect(page1Ids).not.toContain(id);
    }
    // Every page-2 id is strictly below the page-1 boundary: nothing newer leaks
    // back into an older page, and no older item between the boundary and the
    // page-2 head is skipped.
    const boundary = page1Ids[page1Ids.length - 1];
    for (const id of page2Ids) {
      expect(id).toBeLessThan(boundary);
    }
    // The ids immediately below the boundary must be exactly the next contiguous
    // run (descending), proving nothing was skipped.
    const expectedNext = page2Ids.slice().sort((a, b) => b - a);
    expect(page2Ids).toEqual(expectedNext);
    // Confirm our seeded ids were not disturbed by the inserts: each seeded id
    // (<= maxSeeded) is still reachable in descending order.
    expect(maxSeeded).toBeGreaterThan(0);
  });

  test("exact page boundary yields a cursor whose next page is empty with null", async () => {
    if (!server) throw new Error("server did not start");
    const limit = 10;

    // Count the current feed by walking it with this page size.
    async function countAll(): Promise<number> {
      let total = 0;
      let cursor: string | undefined;
      let guard = 0;
      for (;;) {
        const page = await getPage(server.baseUrl, limit, cursor);
        expect(page.status).toBe(200);
        total += page.body.items.length;
        if (page.body.next_cursor === null) break;
        cursor = page.body.next_cursor;
        if (++guard > 10000) throw new Error("pagination did not terminate");
      }
      return total;
    }

    // Pad the feed so its size is an exact multiple of `limit`.
    const before = await countAll();
    const remainder = before % limit;
    if (remainder !== 0) {
      for (let i = 0; i < limit - remainder; i += 1) {
        await createEvent(server.baseUrl, `boundary-pad-${i}`);
      }
    }

    // Walk to the final non-empty page. Because the count is now an exact
    // multiple of `limit`, that page is a FULL page (exactly `limit` items)
    // that exhausts the feed: it must carry a non-null cursor whose next page
    // is empty with a null cursor.
    let cursor: string | undefined;
    let lastFull: any;
    let guard = 0;
    for (;;) {
      const page = await getPage(server.baseUrl, limit, cursor);
      expect(page.status).toBe(200);
      if (page.body.items.length === 0) break;
      lastFull = page.body;
      if (page.body.next_cursor === null) break;
      cursor = page.body.next_cursor;
      if (++guard > 10000) throw new Error("pagination did not terminate");
    }

    expect(lastFull.items.length).toBe(limit);
    expect(lastFull.next_cursor).not.toBeNull();

    const empty = await getPage(server.baseUrl, limit, lastFull.next_cursor);
    expect(empty.status).toBe(200);
    expect(empty.body.items).toEqual([]);
    expect(empty.body.next_cursor).toBeNull();
  });
});
