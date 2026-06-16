import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

describe("scoped-tokens file api", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("a read-only token can list files", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/files`, {
      headers: { authorization: "Bearer tok-ro" },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.files)).toBe(true);
  });

  test("a write token can create a file", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/files`, {
      method: "POST",
      headers: auth("tok-rw"),
      body: JSON.stringify({ name: "report.txt" }),
    });
    expect(response.status).toBe(201);
    const file = await response.json();
    expect(file.name).toBe("report.txt");
    expect(typeof file.id).toBe("string");
  });

  test("missing token returns 401 unauthorized", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/files`);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("unauthorized");
  });
});
