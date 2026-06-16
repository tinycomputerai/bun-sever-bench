import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

describe("optimistic-version document store", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("creates a document at version 1", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/docs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "hello", body: "world" }),
    });
    expect(response.status).toBe(201);
    const doc = await response.json();
    expect(doc.version).toBe(1);
    expect(doc.title).toBe("hello");
    expect(doc.body).toBe("world");
    expect(typeof doc.id).toBe("number");
  });

  test("reads a document and bumps version on a matching update", async () => {
    if (!server) throw new Error("server did not start");
    const created = await (
      await fetch(`${server.baseUrl}/docs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "doc", body: "v1" }),
      })
    ).json();

    const updated = await fetch(`${server.baseUrl}/docs/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": String(created.version) },
      body: JSON.stringify({ body: "v2" }),
    });
    expect(updated.status).toBe(200);
    const doc = await updated.json();
    expect(doc.version).toBe(2);
    expect(doc.body).toBe("v2");
    expect(doc.title).toBe("doc");
  });

  test("rejects an update whose If-Match version is stale", async () => {
    if (!server) throw new Error("server did not start");
    const created = await (
      await fetch(`${server.baseUrl}/docs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "doc", body: "v1" }),
      })
    ).json();

    const conflict = await fetch(`${server.baseUrl}/docs/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": "999" },
      body: JSON.stringify({ body: "nope" }),
    });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error).toBe("version_conflict");
  });
});
