import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

let counter = 0;
function freshKey() {
  counter += 1;
  return `key-${Date.now()}-${counter}`;
}

describe("idempotent payment capture", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("first capture for a key returns 201 captured payment", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": freshKey() },
      body: JSON.stringify({ amount: 100, currency: "USD" }),
    });
    expect(response.status).toBe(201);
    const payment = await response.json();
    expect(payment.amount).toBe(100);
    expect(payment.currency).toBe("USD");
    expect(payment.status).toBe("captured");
    expect(typeof payment.id).toBe("string");
  });

  test("the captured payment is readable via GET /payments/:id", async () => {
    if (!server) throw new Error("server did not start");
    const created = await (
      await fetch(`${server.baseUrl}/payments`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": freshKey() },
        body: JSON.stringify({ amount: 250, currency: "EUR" }),
      })
    ).json();

    const read = await fetch(`${server.baseUrl}/payments/${created.id}`);
    expect(read.status).toBe(200);
    const payment = await read.json();
    expect(payment.id).toBe(created.id);
    expect(payment.amount).toBe(250);
  });

  test("missing Idempotency-Key is rejected with 400", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 100, currency: "USD" }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("missing_idempotency_key");
  });
});
