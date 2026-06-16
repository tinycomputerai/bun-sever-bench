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
  return response.json();
}

describe("rbac authorization edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("viewer cannot create a document (403 forbidden, not 401)", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/documents`, {
      method: "POST",
      headers: auth("tok-viewer"),
      body: JSON.stringify({ title: "x", body: "y" }),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("forbidden");
  });

  test("editor can update a document they own", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl, "tok-editor", "own", "v1");
    const response = await fetch(`${server.baseUrl}/documents/${doc.id}`, {
      method: "PUT",
      headers: auth("tok-editor"),
      body: JSON.stringify({ body: "v2" }),
    });
    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated.body).toBe("v2");
    expect(updated.owner).toBe("editor");
  });

  test("editor cannot update another editor's document (ownership enforced)", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl, "tok-editor", "owned-by-editor", "v1");
    const response = await fetch(`${server.baseUrl}/documents/${doc.id}`, {
      method: "PUT",
      headers: auth("tok-editor2"),
      body: JSON.stringify({ body: "hijack" }),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("forbidden");

    // verify the document was not modified by the rejected write
    const after = await (
      await fetch(`${server.baseUrl}/documents/${doc.id}`, { headers: { authorization: "Bearer tok-admin" } })
    ).json();
    expect(after.body).toBe("v1");
  });

  test("admin can update an editor's document (admin override)", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl, "tok-editor", "by-editor", "v1");
    const response = await fetch(`${server.baseUrl}/documents/${doc.id}`, {
      method: "PUT",
      headers: auth("tok-admin"),
      body: JSON.stringify({ body: "admin-edit" }),
    });
    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated.body).toBe("admin-edit");
    // ownership is preserved; only admin overrode the permission to write
    expect(updated.owner).toBe("editor");
  });

  test("viewer cannot update any document (403)", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl, "tok-editor", "x", "v1");
    const response = await fetch(`${server.baseUrl}/documents/${doc.id}`, {
      method: "PUT",
      headers: auth("tok-viewer"),
      body: JSON.stringify({ body: "nope" }),
    });
    expect(response.status).toBe(403);
  });

  test("DELETE is allowed only for admin; editor and viewer get 403", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl, "tok-editor", "to-delete", "v1");

    const byEditor = await fetch(`${server.baseUrl}/documents/${doc.id}`, {
      method: "DELETE",
      headers: { authorization: "Bearer tok-editor" },
    });
    expect(byEditor.status).toBe(403);

    const byViewer = await fetch(`${server.baseUrl}/documents/${doc.id}`, {
      method: "DELETE",
      headers: { authorization: "Bearer tok-viewer" },
    });
    expect(byViewer.status).toBe(403);

    // still present because the forbidden deletes did nothing
    const stillThere = await fetch(`${server.baseUrl}/documents/${doc.id}`, {
      headers: { authorization: "Bearer tok-admin" },
    });
    expect(stillThere.status).toBe(200);

    const byAdmin = await fetch(`${server.baseUrl}/documents/${doc.id}`, {
      method: "DELETE",
      headers: { authorization: "Bearer tok-admin" },
    });
    expect(byAdmin.status).toBe(204);

    const after = await fetch(`${server.baseUrl}/documents/${doc.id}`, {
      headers: { authorization: "Bearer tok-admin" },
    });
    expect(after.status).toBe(404);
  });

  test("unknown token returns 401, distinct from a forbidden 403", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/documents`, {
      method: "POST",
      headers: auth("tok-bogus"),
      body: JSON.stringify({ title: "x", body: "y" }),
    });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
  });

  test("missing token returns 401", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/documents/0`, { method: "GET" });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
  });

  test("admin can create and the document is owned by admin", async () => {
    if (!server) throw new Error("server did not start");
    const doc = await createDoc(server.baseUrl, "tok-admin", "admin-doc", "v1");
    expect(doc.owner).toBe("admin");
  });

  test("reading an unknown id returns 404 for an authenticated user", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/documents/9999999`, {
      headers: { authorization: "Bearer tok-viewer" },
    });
    expect(response.status).toBe(404);
  });
});
