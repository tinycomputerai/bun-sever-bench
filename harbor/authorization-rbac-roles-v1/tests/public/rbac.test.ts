import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function createDoc(baseUrl: string, token: string, title = "t", body = "b") {
  const response = await fetch(`${baseUrl}/documents`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ title, body }),
  });
  return response;
}

describe("rbac document store", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("editor can create a document owned by themselves", async () => {
    if (!server) throw new Error("server did not start");
    const response = await createDoc(server.baseUrl, "tok-editor", "hello", "world");
    expect(response.status).toBe(201);
    const doc = await response.json();
    expect(doc.owner).toBe("editor");
    expect(doc.title).toBe("hello");
    expect(doc.body).toBe("world");
    expect(typeof doc.id).toBe("string");
  });

  test("any authenticated role can read a document", async () => {
    if (!server) throw new Error("server did not start");
    const created = await (await createDoc(server.baseUrl, "tok-editor")).json();
    const response = await fetch(`${server.baseUrl}/documents/${created.id}`, {
      headers: { authorization: "Bearer tok-viewer" },
    });
    expect(response.status).toBe(200);
    const doc = await response.json();
    expect(doc.id).toBe(created.id);
    expect(doc.owner).toBe("editor");
  });

  test("missing token returns 401 unauthorized", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/documents/0`);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
  });
});
