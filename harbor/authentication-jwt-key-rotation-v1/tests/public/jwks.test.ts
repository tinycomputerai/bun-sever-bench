import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { signJwt } from "../helpers/jwt";
import { startTaskServer, type RunningServer } from "../helpers/server";

async function mint(baseUrl: string, sub = "alice") {
  return fetch(`${baseUrl}/mint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sub }),
  });
}

async function verify(baseUrl: string, token: string) {
  return fetch(`${baseUrl}/verify`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

async function rotate(baseUrl: string) {
  return fetch(`${baseUrl}/keys/rotate`, { method: "POST" });
}

async function retire(baseUrl: string, kid: string) {
  return fetch(`${baseUrl}/keys/${encodeURIComponent(kid)}/retire`, { method: "POST" });
}

async function jwks(baseUrl: string) {
  return fetch(`${baseUrl}/.well-known/jwks`);
}

describe("jwt key rotation public", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("minted token verifies and returns sub", async () => {
    if (!server) throw new Error("server did not start");
    const token = (await (await mint(server.baseUrl)).json()).token;
    const response = await verify(server.baseUrl, token);
    expect(response.status).toBe(200);
    expect((await response.json()).sub).toBe("alice");
  });

  test("jwks lists at least one key with kid and k", async () => {
    if (!server) throw new Error("server did not start");
    const body = await (await jwks(server.baseUrl)).json();
    expect(Array.isArray(body.keys)).toBe(true);
    expect(body.keys.length).toBeGreaterThan(0);
    expect(typeof body.keys[0].kid).toBe("string");
    expect(typeof body.keys[0].k).toBe("string");
  });

  test("after rotation the old key token still verifies until retired", async () => {
    if (!server) throw new Error("server did not start");
    const beforeRotate = await jwks(server.baseUrl);
    const oldKeys = (await beforeRotate.json()).keys;
    const oldKid = oldKeys[0].kid;
    const oldSecret = Buffer.from(oldKeys[0].k, "base64url").toString("utf8");

    const oldToken = signJwt("bob", oldKid, oldSecret);
    expect((await verify(server.baseUrl, oldToken)).status).toBe(200);

    const rotated = await (await rotate(server.baseUrl)).json();
    expect(typeof rotated.kid).toBe("string");

    expect((await verify(server.baseUrl, oldToken)).status).toBe(200);

    await retire(server.baseUrl, oldKid);
    expect((await verify(server.baseUrl, oldToken)).status).toBe(401);
  });

  test("new mint uses the rotated active kid", async () => {
    if (!server) throw new Error("server did not start");
    const { kid: newKid } = await (await rotate(server.baseUrl)).json();
    const token = (await (await mint(server.baseUrl)).json()).token;
    const header = JSON.parse(Buffer.from(token.split(".")[0]!, "base64url").toString("utf8"));
    expect(header.kid).toBe(newKid);
  });
});
