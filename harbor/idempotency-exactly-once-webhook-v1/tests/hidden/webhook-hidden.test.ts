import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getResource, postWebhook, signWebhook } from "../helpers/webhook";
import { startTaskServer, type RunningServer } from "../helpers/server";

let counter = 0;
function unique(prefix: string) {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

describe("exactly-once webhook hidden", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("sequence gap is acked but state does not advance past the gap", async () => {
    if (!server) throw new Error("server did not start");
    const resource = unique("gap");
    await postWebhook(server.baseUrl, {
      event_id: unique("evt"),
      type: "increment",
      resource_id: resource,
      sequence: 1,
      data: { amount: 2 },
    });
    const gapAck = await postWebhook(server.baseUrl, {
      event_id: unique("evt"),
      type: "increment",
      resource_id: resource,
      sequence: 3,
      data: { amount: 100 },
    });
    expect(gapAck.status).toBe(200);

    let state = await (await getResource(server.baseUrl, resource)).json();
    expect(state.balance).toBe(2);
    expect(state.last_sequence).toBe(1);

    await postWebhook(server.baseUrl, {
      event_id: unique("evt"),
      type: "increment",
      resource_id: resource,
      sequence: 2,
      data: { amount: 5 },
    });
    state = await (await getResource(server.baseUrl, resource)).json();
    expect(state.balance).toBe(107);
    expect(state.last_sequence).toBe(3);
  });

  test("superseded lower sequence after newer applied is ignored", async () => {
    if (!server) throw new Error("server did not start");
    const resource = unique("super");
    await postWebhook(server.baseUrl, {
      event_id: unique("evt"),
      type: "set",
      resource_id: resource,
      sequence: 1,
      data: { balance: 1 },
    });
    await postWebhook(server.baseUrl, {
      event_id: unique("evt"),
      type: "set",
      resource_id: resource,
      sequence: 2,
      data: { balance: 9 },
    });
    const replay = await postWebhook(server.baseUrl, {
      event_id: unique("evt"),
      type: "set",
      resource_id: resource,
      sequence: 1,
      data: { balance: 999 },
    });
    expect(replay.status).toBe(200);
    const state = await (await getResource(server.baseUrl, resource)).json();
    expect(state.balance).toBe(9);
  });

  test("concurrent duplicates apply exactly once", async () => {
    if (!server) throw new Error("server did not start");
    const resource = unique("conc");
    const event = {
      event_id: unique("evt-conc"),
      type: "increment" as const,
      resource_id: resource,
      sequence: 1,
      data: { amount: 7 },
    };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => postWebhook(server.baseUrl, event)),
    );
    for (const r of results) {
      expect(r.status).toBe(200);
    }
    const state = await (await getResource(server.baseUrl, resource)).json();
    expect(state.balance).toBe(7);
  });

  test("tampered body fails signature and does not change state", async () => {
    if (!server) throw new Error("server did not start");
    const resource = unique("tamper");
    const legit = {
      event_id: unique("evt"),
      type: "set" as const,
      resource_id: resource,
      sequence: 1,
      data: { balance: 3 },
    };
    const raw = JSON.stringify(legit);
    const tampered = raw.replace('"balance":3', '"balance":300');
    const response = await fetch(`${server.baseUrl}/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature": signWebhook(raw),
      },
      body: tampered,
    });
    expect(response.status).toBe(401);
    expect((await getResource(server.baseUrl, resource)).status).toBe(404);
  });

  test("duplicate after processing returns 200 without extra apply", async () => {
    if (!server) throw new Error("server did not start");
    const resource = unique("dup2");
    const event = {
      event_id: unique("evt"),
      type: "increment" as const,
      resource_id: resource,
      sequence: 1,
      data: { amount: 4 },
    };
    const first = await postWebhook(server.baseUrl, event);
    const second = await postWebhook(server.baseUrl, event);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const state = await (await getResource(server.baseUrl, resource)).json();
    expect(state.balance).toBe(4);
  });

  test("healthz returns ok", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/healthz`);
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});
