import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function createConfig(baseUrl: string, key = "k", value = "v") {
  const response = await fetch(`${baseUrl}/configs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  return response;
}

describe("strong ETag optimistic concurrency edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("ETag is a stable content hash: same content -> same ETag", async () => {
    if (!server) throw new Error("server did not start");
    const a = await createConfig(server.baseUrl, "dup", "same");
    const b = await createConfig(server.baseUrl, "dup", "same");
    const etagA = a.headers.get("etag");
    const etagB = b.headers.get("etag");
    expect(etagA).toMatch(/^"[0-9a-f]{64}"$/);
    expect(etagA).toBe(etagB);

    // distinct resources despite identical content
    const idA = (await a.json()).id;
    const idB = (await b.json()).id;
    expect(idA).not.toBe(idB);
  });

  test("GET twice returns an identical ETag", async () => {
    if (!server) throw new Error("server did not start");
    const created = await createConfig(server.baseUrl, "stable", "x");
    const id = (await created.json()).id;
    const first = await fetch(`${server.baseUrl}/configs/${id}`);
    const second = await fetch(`${server.baseUrl}/configs/${id}`);
    expect(first.headers.get("etag")).toBe(second.headers.get("etag"));
  });

  test("changing value changes the ETag; same value keeps it identical", async () => {
    if (!server) throw new Error("server did not start");
    const created = await createConfig(server.baseUrl, "ch", "before");
    const original = created.headers.get("etag")!;
    const id = (await created.json()).id;

    const changed = await fetch(`${server.baseUrl}/configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": original },
      body: JSON.stringify({ value: "after" }),
    });
    expect(changed.status).toBe(200);
    const changedEtag = changed.headers.get("etag")!;
    expect(changedEtag).not.toBe(original);

    // setting value back to the original content reproduces the original ETag
    const reverted = await fetch(`${server.baseUrl}/configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": changedEtag },
      body: JSON.stringify({ value: "before" }),
    });
    expect(reverted.status).toBe(200);
    expect(reverted.headers.get("etag")).toBe(original);
  });

  test("a stale If-Match (ETag from before an update) returns 412", async () => {
    if (!server) throw new Error("server did not start");
    const created = await createConfig(server.baseUrl, "stale", "v1");
    const staleEtag = created.headers.get("etag")!;
    const id = (await created.json()).id;

    const first = await fetch(`${server.baseUrl}/configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": staleEtag },
      body: JSON.stringify({ value: "v2" }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${server.baseUrl}/configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": staleEtag },
      body: JSON.stringify({ value: "v3" }),
    });
    expect(second.status).toBe(412);
    expect((await second.json()).error).toBe("precondition_failed");
  });

  test("two concurrent PUTs on the same ETag: exactly one 200, one 412", async () => {
    if (!server) throw new Error("server did not start");
    const created = await createConfig(server.baseUrl, "race", "v1");
    const etag = created.headers.get("etag")!;
    const id = (await created.json()).id;

    const [a, b] = await Promise.all([
      fetch(`${server.baseUrl}/configs/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": etag },
        body: JSON.stringify({ value: "writer-a" }),
      }),
      fetch(`${server.baseUrl}/configs/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": etag },
        body: JSON.stringify({ value: "writer-b" }),
      }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 412]);
  });

  test("If-Match comparison ignores quotes and W/ prefix", async () => {
    if (!server) throw new Error("server did not start");
    const created = await createConfig(server.baseUrl, "weak", "v1");
    const quoted = created.headers.get("etag")!; // "<hex>"
    const id = (await created.json()).id;
    const bareHex = quoted.replace(/^"(.*)"$/, "$1");

    const withWeakPrefix = await fetch(`${server.baseUrl}/configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": `W/${quoted}` },
      body: JSON.stringify({ value: "v2" }),
    });
    expect(withWeakPrefix.status).toBe(200);
    const newEtag = withWeakPrefix.headers.get("etag")!;
    const newBare = newEtag.replace(/^"(.*)"$/, "$1");

    // bare unquoted hex must also be accepted
    const withBare = await fetch(`${server.baseUrl}/configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": newBare },
      body: JSON.stringify({ value: "v3" }),
    });
    expect(withBare.status).toBe(200);
    expect(bareHex).toMatch(/^[0-9a-f]{64}$/);
  });

  test("If-Match * (wildcard) succeeds on an existing resource", async () => {
    if (!server) throw new Error("server did not start");
    const created = await createConfig(server.baseUrl, "wild", "v1");
    const id = (await created.json()).id;

    const response = await fetch(`${server.baseUrl}/configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": "*" },
      body: JSON.stringify({ value: "wildcarded" }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).value).toBe("wildcarded");
  });

  test("missing If-Match returns 428", async () => {
    if (!server) throw new Error("server did not start");
    const created = await createConfig(server.baseUrl, "noguard", "v1");
    const id = (await created.json()).id;

    const response = await fetch(`${server.baseUrl}/configs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x" }),
    });
    expect(response.status).toBe(428);
    expect((await response.json()).error).toBe("precondition_required");
  });

  test("mismatched If-Match on an unchanged resource returns 412", async () => {
    if (!server) throw new Error("server did not start");
    const created = await createConfig(server.baseUrl, "bad", "v1");
    const id = (await created.json()).id;

    const response = await fetch(`${server.baseUrl}/configs/${id}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-match": '"0000000000000000000000000000000000000000000000000000000000000000"',
      },
      body: JSON.stringify({ value: "x" }),
    });
    expect(response.status).toBe(412);
    expect((await response.json()).error).toBe("precondition_failed");
  });

  test("PUT on an unknown id returns 404", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/configs/does-not-exist`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": "*" },
      body: JSON.stringify({ value: "x" }),
    });
    expect(response.status).toBe(404);
  });
});
