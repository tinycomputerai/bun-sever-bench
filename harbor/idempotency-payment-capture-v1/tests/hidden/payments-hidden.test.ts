import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

let counter = 0;
function freshKey() {
  counter += 1;
  return `hkey-${Date.now()}-${counter}`;
}

function capture(baseUrl: string, key: string, body: unknown) {
  return fetch(`${baseUrl}/payments`, {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

describe("payment capture idempotency edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("replay of same key + same body returns identical id, 201, and the replay header", async () => {
    if (!server) throw new Error("server did not start");
    const key = freshKey();
    const first = await capture(server.baseUrl, key, { amount: 500, currency: "USD" });
    expect(first.status).toBe(201);
    const firstPayment = await first.json();

    const replay = await capture(server.baseUrl, key, { amount: 500, currency: "USD" });
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    const replayPayment = await replay.json();
    expect(replayPayment.id).toBe(firstPayment.id);
    expect(replayPayment.amount).toBe(500);
    expect(replayPayment.currency).toBe("USD");
    expect(replayPayment.status).toBe("captured");
  });

  test("same key with a different amount is a 409 idempotency_key_reuse", async () => {
    if (!server) throw new Error("server did not start");
    const key = freshKey();
    const first = await capture(server.baseUrl, key, { amount: 100, currency: "USD" });
    expect(first.status).toBe(201);

    const conflict = await capture(server.baseUrl, key, { amount: 200, currency: "USD" });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toBe("idempotency_key_reuse");
  });

  test("same key with a different currency is a 409 idempotency_key_reuse", async () => {
    if (!server) throw new Error("server did not start");
    const key = freshKey();
    await capture(server.baseUrl, key, { amount: 100, currency: "USD" });

    const conflict = await capture(server.baseUrl, key, { amount: 100, currency: "EUR" });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toBe("idempotency_key_reuse");
  });

  test("a 409 conflict does not overwrite or duplicate the original payment", async () => {
    if (!server) throw new Error("server did not start");
    const key = freshKey();
    const original = await (await capture(server.baseUrl, key, { amount: 100, currency: "USD" })).json();

    await capture(server.baseUrl, key, { amount: 999, currency: "USD" });

    const replay = await capture(server.baseUrl, key, { amount: 100, currency: "USD" });
    expect(replay.status).toBe(201);
    const replayed = await replay.json();
    expect(replayed.id).toBe(original.id);
    expect(replayed.amount).toBe(100);
  });

  test("missing Idempotency-Key returns 400 before body validation", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: -5, currency: 42 }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("missing_idempotency_key");
  });

  test("invalid amount (<= 0) returns 422", async () => {
    if (!server) throw new Error("server did not start");
    const response = await capture(server.baseUrl, freshKey(), { amount: 0, currency: "USD" });
    expect(response.status).toBe(422);
  });

  test("non-integer amount returns 422", async () => {
    if (!server) throw new Error("server did not start");
    const response = await capture(server.baseUrl, freshKey(), { amount: 12.5, currency: "USD" });
    expect(response.status).toBe(422);
  });

  test("missing currency returns 422", async () => {
    if (!server) throw new Error("server did not start");
    const response = await capture(server.baseUrl, freshKey(), { amount: 100 });
    expect(response.status).toBe(422);
  });

  test("concurrent identical requests with one key create exactly one payment", async () => {
    if (!server) throw new Error("server did not start");
    const key = freshKey();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => capture(server!.baseUrl, key, { amount: 777, currency: "USD" })),
    );

    for (const response of responses) {
      expect(response.status).toBe(201);
    }
    const bodies = await Promise.all(responses.map((r) => r.json()));
    const uniqueIds = new Set(bodies.map((b) => b.id));
    expect(uniqueIds.size).toBe(1);

    // Exactly one of the five is the original creator (no replay header); the
    // rest are replays.
    const replayFlags = responses.map((r) => r.headers.get("idempotency-replayed"));
    expect(replayFlags.filter((f) => f === "true").length).toBe(4);
  });

  test("unknown payment id returns 404", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/payments/does-not-exist`);
    expect(response.status).toBe(404);
  });

  test("healthz returns 200 ok", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/healthz`);
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});
