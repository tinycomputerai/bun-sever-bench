import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function createDoc(baseUrl: string, title = "t", body = "b") {
  const response = await fetch(`${baseUrl}/docs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  return response.json();
}

describe("optimistic concurrency edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("only one of two concurrent updates on the same version succeeds (lost-update prevention)", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl, "race", "v1");

    const [a, b] = await Promise.all([
      fetch(`${server.baseUrl}/docs/${doc.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": String(doc.version) },
        body: JSON.stringify({ body: "writer-a" }),
      }),
      fetch(`${server.baseUrl}/docs/${doc.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": String(doc.version) },
        body: JSON.stringify({ body: "writer-b" }),
      }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const final = await (await fetch(`${server.baseUrl}/docs/${doc.id}`)).json();
    expect(final.version).toBe(2);
  });

  test("version is monotonic and never reused across many updates", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl, "mono", "v1");
    let version = doc.version;
    for (let i = 0; i < 5; i += 1) {
      const response = await fetch(`${server.baseUrl}/docs/${doc.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": String(version) },
        body: JSON.stringify({ body: `v${i}` }),
      });
      expect(response.status).toBe(200);
      const updated = await response.json();
      expect(updated.version).toBe(version + 1);
      version = updated.version;
    }
  });

  test("missing If-Match on update is rejected with 428", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl);
    const response = await fetch(`${server.baseUrl}/docs/${doc.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: "x" }),
    });
    expect(response.status).toBe(428);
    expect((await response.json()).error).toBe("precondition_required");
  });

  test("non-numeric If-Match is a 400, not a conflict", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl);
    const response = await fetch(`${server.baseUrl}/docs/${doc.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": "not-a-version" },
      body: JSON.stringify({ body: "x" }),
    });
    expect(response.status).toBe(400);
  });

  test("GET exposes the current version via the ETag header", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl);
    const response = await fetch(`${server.baseUrl}/docs/${doc.id}`);
    expect(response.headers.get("etag")).toBe(`"${doc.version}"`);
  });

  test("DELETE requires a matching If-Match and removes the document", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl);

    const noGuard = await fetch(`${server.baseUrl}/docs/${doc.id}`, { method: "DELETE" });
    expect(noGuard.status).toBe(428);

    const removed = await fetch(`${server.baseUrl}/docs/${doc.id}`, {
      method: "DELETE",
      headers: { "if-match": String(doc.version) },
    });
    expect(removed.status).toBe(204);

    const after = await fetch(`${server.baseUrl}/docs/${doc.id}`);
    expect(after.status).toBe(404);
  });

  test("documents and versions survive a process restart", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl, "persist", "original");
    await fetch(`${server.baseUrl}/docs/${doc.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": String(doc.version) },
      body: JSON.stringify({ body: "updated" }),
    });

    await server.stop();
    server = await startTaskServer();

    const reread = await fetch(`${server.baseUrl}/docs/${doc.id}`);
    expect(reread.status).toBe(200);
    const persisted = await reread.json();
    expect(persisted.version).toBe(2);
    expect(persisted.body).toBe("updated");
  });
});
