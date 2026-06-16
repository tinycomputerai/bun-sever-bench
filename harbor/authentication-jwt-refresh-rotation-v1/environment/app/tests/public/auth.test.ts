import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function login(baseUrl: string, username = "alice", password = "password123") {
  return fetch(`${baseUrl}/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

async function refresh(baseUrl: string, token: string) {
  return fetch(`${baseUrl}/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: token }),
  });
}

describe("jwt refresh rotation", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("login returns an access and refresh token pair", async () => {
    if (!server) throw new Error("server did not start");
    const response = await login(server.baseUrl);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.access_token).toBe("string");
    expect(typeof body.refresh_token).toBe("string");
  });

  test("the access token from login authorizes GET /protected", async () => {
    if (!server) throw new Error("server did not start");
    const { access_token } = await (await login(server.baseUrl)).json();
    const response = await fetch(`${server.baseUrl}/protected`, {
      headers: { authorization: `Bearer ${access_token}` },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).sub).toBe("alice");
  });

  test("refresh issues a new working pair", async () => {
    if (!server) throw new Error("server did not start");
    const first = await (await login(server.baseUrl)).json();
    const response = await refresh(server.baseUrl, first.refresh_token);
    expect(response.status).toBe(200);
    const next = await response.json();
    expect(typeof next.access_token).toBe("string");
    expect(typeof next.refresh_token).toBe("string");

    const protectedResp = await fetch(`${server.baseUrl}/protected`, {
      headers: { authorization: `Bearer ${next.access_token}` },
    });
    expect(protectedResp.status).toBe(200);
  });

  test("wrong credentials are rejected", async () => {
    if (!server) throw new Error("server did not start");
    const response = await login(server.baseUrl, "alice", "wrong");
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_credentials");
  });
});
