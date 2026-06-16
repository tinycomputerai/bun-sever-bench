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

describe("refresh rotation hardening", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("the old refresh token no longer works after a rotation", async () => {
    if (!server) throw new Error("server did not start");
    const first = await (await login(server.baseUrl)).json();
    const rotated = await (await refresh(server.baseUrl, first.refresh_token)).json();
    expect(typeof rotated.refresh_token).toBe("string");
    expect(rotated.refresh_token).not.toBe(first.refresh_token);

    // Presenting the consumed (old) token again must fail.
    const reuse = await refresh(server.baseUrl, first.refresh_token);
    expect(reuse.status).toBe(401);
    expect(["invalid_refresh", "token_reuse_detected"]).toContain(
      (await reuse.json()).error,
    );
  });

  test("an unknown refresh token is invalid_refresh", async () => {
    if (!server) throw new Error("server did not start");
    const response = await refresh(server.baseUrl, "not-a-real-token-deadbeef");
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_refresh");
  });

  test("reusing a rotated-out token revokes the whole family, killing the current token too", async () => {
    if (!server) throw new Error("server did not start");
    const first = await (await login(server.baseUrl)).json();
    const second = await (await refresh(server.baseUrl, first.refresh_token)).json();
    // second.refresh_token is now the currently-valid token for this family.

    // Reuse the already-consumed first token -> reuse detected, family revoked.
    const reuse = await refresh(server.baseUrl, first.refresh_token);
    expect(reuse.status).toBe(401);
    expect((await reuse.json()).error).toBe("token_reuse_detected");

    // The currently-valid token (second) must ALSO be dead now.
    const afterRevoke = await refresh(server.baseUrl, second.refresh_token);
    expect(afterRevoke.status).toBe(401);
    expect((await afterRevoke.json()).error).toBe("invalid_refresh");
  });

  test("revoking one family does not affect a different family", async () => {
    if (!server) throw new Error("server did not start");
    // Family A — trigger reuse revocation.
    const a1 = await (await login(server.baseUrl)).json();
    await refresh(server.baseUrl, a1.refresh_token); // consume a1
    await refresh(server.baseUrl, a1.refresh_token); // reuse -> revoke family A

    // Family B — independent, should still rotate fine.
    const b1 = await (await login(server.baseUrl)).json();
    const b2 = await refresh(server.baseUrl, b1.refresh_token);
    expect(b2.status).toBe(200);
  });

  test("a chain of rotations works and only the latest token is valid", async () => {
    if (!server) throw new Error("server did not start");
    let current = (await (await login(server.baseUrl)).json()).refresh_token;
    const history: string[] = [current];
    for (let i = 0; i < 4; i += 1) {
      const next = await (await refresh(server.baseUrl, current)).json();
      expect(typeof next.refresh_token).toBe("string");
      current = next.refresh_token;
      history.push(current);
    }
    // Every earlier token in the chain must now be rejected.
    for (let i = 0; i < history.length - 1; i += 1) {
      const stale = await refresh(server.baseUrl, history[i]);
      expect(stale.status).toBe(401);
    }
  });

  test("an invalid access token is rejected by /protected", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/protected`, {
      headers: { authorization: "Bearer not.a.jwt" },
    });
    expect(response.status).toBe(401);
  });

  test("a missing Authorization header is rejected by /protected", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/protected`);
    expect(response.status).toBe(401);
  });
});
