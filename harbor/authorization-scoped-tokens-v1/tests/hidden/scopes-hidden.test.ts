import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function createFile(baseUrl: string, token: string, name = "f.txt") {
  const response = await fetch(`${baseUrl}/files`, {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify({ name }),
  });
  return response.json();
}

describe("scope-based authorization edge cases", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("read-only token POSTing returns 403 with WWW-Authenticate naming files:write", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/files`, {
      method: "POST",
      headers: auth("tok-ro"),
      body: JSON.stringify({ name: "x.txt" }),
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("insufficient_scope");
    expect(response.headers.get("www-authenticate")).toBe('Bearer scope="files:write"');
  });

  test("write token DELETEing returns 403 with WWW-Authenticate naming files:delete", async () => {
    if (!server) throw new Error("server did not start");
    // create with admin so a real id exists; the scope check must reject before the lookup matters
    const file = await createFile(server.baseUrl, "tok-admin", "to-delete.txt");
    const response = await fetch(`${server.baseUrl}/files/${file.id}`, {
      method: "DELETE",
      headers: { authorization: "Bearer tok-rw" },
    });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe("insufficient_scope");
    expect(response.headers.get("www-authenticate")).toBe('Bearer scope="files:delete"');

    // the rejected delete left the file intact
    const list = await (
      await fetch(`${server.baseUrl}/files`, { headers: { authorization: "Bearer tok-admin" } })
    ).json();
    expect(list.files.some((f: { id: string }) => f.id === file.id)).toBe(true);
  });

  test("admin token can read, write, and delete", async () => {
    if (!server) throw new Error("server did not start");
    const created = await createFile(server.baseUrl, "tok-admin", "admin.txt");

    const read = await fetch(`${server.baseUrl}/files`, { headers: { authorization: "Bearer tok-admin" } });
    expect(read.status).toBe(200);

    const del = await fetch(`${server.baseUrl}/files/${created.id}`, {
      method: "DELETE",
      headers: { authorization: "Bearer tok-admin" },
    });
    expect(del.status).toBe(204);

    const after = await (
      await fetch(`${server.baseUrl}/files`, { headers: { authorization: "Bearer tok-admin" } })
    ).json();
    expect(after.files.some((f: { id: string }) => f.id === created.id)).toBe(false);
  });

  test("unknown token returns 401, not 403, and has no WWW-Authenticate scope challenge", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/files`, {
      headers: { authorization: "Bearer tok-bogus" },
    });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
  });

  test("missing token returns 401", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/files`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(response.status).toBe(401);
  });

  test("read-only token GETting a 403 on write proves enforcement is per-endpoint not blanket", async () => {
    if (!server) throw new Error("server did not start");
    // same valid token: allowed to read, forbidden to write -> proves scope is checked per endpoint
    const okRead = await fetch(`${server.baseUrl}/files`, { headers: { authorization: "Bearer tok-ro" } });
    expect(okRead.status).toBe(200);

    const forbiddenWrite = await fetch(`${server.baseUrl}/files`, {
      method: "POST",
      headers: auth("tok-ro"),
      body: JSON.stringify({ name: "y.txt" }),
    });
    expect(forbiddenWrite.status).toBe(403);
  });

  test("write token can GET (has files:read) confirming scope is a set not a level", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/files`, { headers: { authorization: "Bearer tok-rw" } });
    expect(response.status).toBe(200);
  });

  test("DELETE of an unknown id by an authorized token returns 404", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/files/9999999`, {
      method: "DELETE",
      headers: { authorization: "Bearer tok-admin" },
    });
    expect(response.status).toBe(404);
  });
});
