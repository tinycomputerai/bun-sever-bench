import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getResource, postWebhook } from "../helpers/webhook";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("exactly-once webhook public", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("signed increment applies once", async () => {
    if (!server) throw new Error("server did not start");
    const resource = "pub-res-1";
    const response = await postWebhook(server.baseUrl, {
      event_id: "evt-pub-1",
      type: "increment",
      resource_id: resource,
      sequence: 1,
      data: { amount: 5 },
    });
    expect(response.status).toBe(200);
    const state = await (await getResource(server.baseUrl, resource)).json();
    expect(state.balance).toBe(5);
    expect(state.last_sequence).toBe(1);
  });

  test("duplicate event_id acks without double apply", async () => {
    if (!server) throw new Error("server did not start");
    const resource = "pub-res-2";
    const event = {
      event_id: "evt-pub-dup",
      type: "set" as const,
      resource_id: resource,
      sequence: 1,
      data: { balance: 10 },
    };
    await postWebhook(server.baseUrl, event);
    await postWebhook(server.baseUrl, event);
    const state = await (await getResource(server.baseUrl, resource)).json();
    expect(state.balance).toBe(10);
  });

  test("out-of-order delivery applies in sequence order", async () => {
    if (!server) throw new Error("server did not start");
    const resource = "pub-res-3";
    await postWebhook(server.baseUrl, {
      event_id: "evt-pub-3b",
      type: "increment",
      resource_id: resource,
      sequence: 2,
      data: { amount: 3 },
    });
    await postWebhook(server.baseUrl, {
      event_id: "evt-pub-3a",
      type: "increment",
      resource_id: resource,
      sequence: 1,
      data: { amount: 4 },
    });
    const state = await (await getResource(server.baseUrl, resource)).json();
    expect(state.balance).toBe(7);
    expect(state.last_sequence).toBe(2);
  });

  test("invalid signature is rejected", async () => {
    if (!server) throw new Error("server did not start");
    const body = JSON.stringify({
      event_id: "evt-pub-bad",
      type: "set",
      resource_id: "pub-res-bad",
      sequence: 1,
      data: { balance: 1 },
    });
    const response = await fetch(`${server.baseUrl}/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature": "sha256=deadbeef" },
      body,
    });
    expect(response.status).toBe(401);
  });
});
