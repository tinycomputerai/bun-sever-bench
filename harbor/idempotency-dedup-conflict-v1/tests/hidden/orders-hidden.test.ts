import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

function createOrder(baseUrl: string, key: string, body: unknown) {
  return fetch(`${baseUrl}/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

describe("order dedup vs idempotency conflict edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("replay of same key + same body returns identical order, 201, and the replay header", async () => {
    if (!server) throw new Error("server did not start");
    const key = unique("key");
    const ref = unique("ref");
    const first = await createOrder(server.baseUrl, key, { reference: ref, item: "a", qty: 2 });
    expect(first.status).toBe(201);
    const firstOrder = await first.json();

    const replay = await createOrder(server.baseUrl, key, { reference: ref, item: "a", qty: 2 });
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    const replayOrder = await replay.json();
    expect(replayOrder.id).toBe(firstOrder.id);
    expect(replayOrder.reference).toBe(ref);
    expect(replayOrder.qty).toBe(2);
  });

  test("same key with a different body is a 409 idempotency_key_reuse (not duplicate_reference)", async () => {
    if (!server) throw new Error("server did not start");
    const key = unique("key");
    const ref = unique("ref");
    await createOrder(server.baseUrl, key, { reference: ref, item: "a", qty: 2 });

    const conflict = await createOrder(server.baseUrl, key, { reference: ref, item: "a", qty: 9 });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toBe("idempotency_key_reuse");
  });

  test("different key reusing an existing reference is a 409 duplicate_reference", async () => {
    if (!server) throw new Error("server did not start");
    const ref = unique("ref");
    const created = await createOrder(server.baseUrl, unique("key"), { reference: ref, item: "a", qty: 1 });
    expect(created.status).toBe(201);

    const conflict = await createOrder(server.baseUrl, unique("key"), { reference: ref, item: "b", qty: 5 });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toBe("duplicate_reference");
  });

  test("the two distinct 409 reasons are not interchangeable", async () => {
    if (!server) throw new Error("server did not start");
    const ref = unique("ref");
    const key = unique("key");

    // First create.
    await createOrder(server.baseUrl, key, { reference: ref, item: "a", qty: 1 });

    // Same key, different body -> key_reuse.
    const reuse = await createOrder(server.baseUrl, key, { reference: ref, item: "z", qty: 7 });
    expect((await reuse.json()).error).toBe("idempotency_key_reuse");

    // Different key, same reference -> duplicate_reference.
    const dup = await createOrder(server.baseUrl, unique("key"), { reference: ref, item: "a", qty: 1 });
    expect((await dup.json()).error).toBe("duplicate_reference");
  });

  test("a duplicate_reference conflict does not create a second order", async () => {
    if (!server) throw new Error("server did not start");
    const ref = unique("ref");
    const original = await (
      await createOrder(server.baseUrl, unique("key"), { reference: ref, item: "a", qty: 1 })
    ).json();

    await createOrder(server.baseUrl, unique("key"), { reference: ref, item: "b", qty: 2 });

    // The original order is unchanged and still readable.
    const read = await (await fetch(`${server.baseUrl}/orders/${original.id}`)).json();
    expect(read.item).toBe("a");
    expect(read.qty).toBe(1);
  });

  test("a different reference under a different key creates a distinct order", async () => {
    if (!server) throw new Error("server did not start");
    const a = await (
      await createOrder(server.baseUrl, unique("key"), { reference: unique("ref"), item: "a", qty: 1 })
    ).json();
    const b = await (
      await createOrder(server.baseUrl, unique("key"), { reference: unique("ref"), item: "b", qty: 1 })
    ).json();
    expect(a.id).not.toBe(b.id);
  });

  test("missing Idempotency-Key returns 400 before body validation", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference: 123, item: 5, qty: -1 }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("missing_idempotency_key");
  });

  test("invalid qty (<= 0) returns 422", async () => {
    if (!server) throw new Error("server did not start");
    const response = await createOrder(server.baseUrl, unique("key"), {
      reference: unique("ref"),
      item: "a",
      qty: 0,
    });
    expect(response.status).toBe(422);
  });

  test("non-integer qty returns 422", async () => {
    if (!server) throw new Error("server did not start");
    const response = await createOrder(server.baseUrl, unique("key"), {
      reference: unique("ref"),
      item: "a",
      qty: 2.5,
    });
    expect(response.status).toBe(422);
  });

  test("missing reference returns 422", async () => {
    if (!server) throw new Error("server did not start");
    const response = await createOrder(server.baseUrl, unique("key"), { item: "a", qty: 1 });
    expect(response.status).toBe(422);
  });

  test("unknown order id returns 404", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/orders/does-not-exist`);
    expect(response.status).toBe(404);
  });

  test("healthz returns 200 ok", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/healthz`);
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});
