import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function createConfig(baseUrl: string, key = "feature", value = "on") {
  const response = await fetch(`${baseUrl}/configs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  return response;
}

describe("etag-concurrency config store", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("creates a config and returns a quoted hex ETag", async () => {
    if (!server) throw new Error("server did not start");
    const response = await createConfig(server.baseUrl, "color", "blue");
    expect(response.status).toBe(201);
    const entry = await response.json();
    expect(entry.key).toBe("color");
    expect(entry.value).toBe("blue");
    expect(typeof entry.id).toBe("string");

    const etag = response.headers.get("etag");
    expect(etag).not.toBeNull();
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
  });

  test("GET returns the entry with the current ETag", async () => {
    if (!server) throw new Error("server did not start");
    const created = await createConfig(server.baseUrl, "size", "large");
    const createdEtag = created.headers.get("etag");
    const entry = await created.json();

    const got = await fetch(`${server.baseUrl}/configs/${entry.id}`);
    expect(got.status).toBe(200);
    expect(got.headers.get("etag")).toBe(createdEtag);
    const body = await got.json();
    expect(body).toEqual({ id: entry.id, key: "size", value: "large" });
  });

  test("PUT with the matching If-Match applies the update", async () => {
    if (!server) throw new Error("server did not start");
    const created = await createConfig(server.baseUrl, "mode", "v1");
    const etag = created.headers.get("etag")!;
    const entry = await created.json();

    const updated = await fetch(`${server.baseUrl}/configs/${entry.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": etag },
      body: JSON.stringify({ value: "v2" }),
    });
    expect(updated.status).toBe(200);
    const body = await updated.json();
    expect(body.value).toBe("v2");
    expect(body.key).toBe("mode");
    expect(updated.headers.get("etag")).not.toBe(etag);
  });

  test("invalid body is rejected with 422", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/configs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "only-key" }),
    });
    expect(response.status).toBe(422);
  });

  test("unknown id returns 404", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/configs/unknown-id`);
    expect(response.status).toBe(404);
  });
});
