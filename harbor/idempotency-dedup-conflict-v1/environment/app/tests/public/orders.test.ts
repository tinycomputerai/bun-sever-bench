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

describe("idempotent order creation", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("a new key creates an order at status created", async () => {
    if (!server) throw new Error("server did not start");
    const response = await createOrder(server.baseUrl, unique("key"), {
      reference: unique("ref"),
      item: "widget",
      qty: 3,
    });
    expect(response.status).toBe(201);
    const order = await response.json();
    expect(order.item).toBe("widget");
    expect(order.qty).toBe(3);
    expect(order.status).toBe("created");
    expect(typeof order.id).toBe("string");
  });

  test("the created order is readable via GET /orders/:id", async () => {
    if (!server) throw new Error("server did not start");
    const created = await (
      await createOrder(server.baseUrl, unique("key"), {
        reference: unique("ref"),
        item: "gadget",
        qty: 1,
      })
    ).json();

    const read = await fetch(`${server.baseUrl}/orders/${created.id}`);
    expect(read.status).toBe(200);
    const order = await read.json();
    expect(order.id).toBe(created.id);
    expect(order.item).toBe("gadget");
  });

  test("missing Idempotency-Key is rejected with 400", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reference: unique("ref"), item: "x", qty: 1 }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("missing_idempotency_key");
  });
});
