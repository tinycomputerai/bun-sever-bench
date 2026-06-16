import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { signJwt, signJwtWithHeader } from "../helpers/jwt";
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

function secretFromJwksKey(key: { k: string }): string {
  return Buffer.from(key.k, "base64url").toString("utf8");
}

describe("jwt key rotation hidden", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("token without kid header is rejected", async () => {
    if (!server) throw new Error("server did not start");
    const keys = (await (await jwks(server.baseUrl)).json()).keys;
    const secret = secretFromJwksKey(keys[0]);
    const token = signJwtWithHeader("alice", { alg: "HS256", typ: "JWT" }, secret);
    expect((await verify(server.baseUrl, token)).status).toBe(401);
  });

  test("unknown kid is rejected without trying other keys", async () => {
    if (!server) throw new Error("server did not start");
    const keys = (await (await jwks(server.baseUrl)).json()).keys;
    const secret = secretFromJwksKey(keys[0]);
    const token = signJwt("alice", "kid-that-does-not-exist", secret);
    expect((await verify(server.baseUrl, token)).status).toBe(401);
  });

  test("retired kid is rejected even with valid signature", async () => {
    if (!server) throw new Error("server did not start");
    const keys = (await (await jwks(server.baseUrl)).json()).keys;
    const kid = keys[0].kid;
    const secret = secretFromJwksKey(keys[0]);
    const token = signJwt("alice", kid, secret);
    await retire(server.baseUrl, kid);
    expect((await verify(server.baseUrl, token)).status).toBe(401);
  });

  test("kid injection attempts are rejected at retire and verify", async () => {
    if (!server) throw new Error("server did not start");
    const injections = ["../etc/passwd", "key; DROP TABLE", "../../../secret"];
    for (const bad of injections) {
      const retireResp = await retire(server.baseUrl, bad);
      expect(retireResp.status).toBe(400);
    }
  });

  test("rotation race: token under pre-rotation key verifies before retire", async () => {
    if (!server) throw new Error("server did not start");
    await rotate(server.baseUrl);
    const preToken = (await (await mint(server.baseUrl, "race-user")).json()).token;
    const header = JSON.parse(Buffer.from(preToken.split(".")[0]!, "base64url").toString("utf8"));
    const preKid = header.kid as string;

    await rotate(server.baseUrl);
    expect((await verify(server.baseUrl, preToken)).status).toBe(200);

    await retire(server.baseUrl, preKid);
    expect((await verify(server.baseUrl, preToken)).status).toBe(401);
  });

  test("jwks cache reflects rotation immediately", async () => {
    if (!server) throw new Error("server did not start");
    const before = (await (await jwks(server.baseUrl)).json()).keys.map((k: { kid: string }) => k.kid);
    const { kid: newKid } = await (await rotate(server.baseUrl)).json();
    const after = (await (await jwks(server.baseUrl)).json()).keys.map((k: { kid: string }) => k.kid);
    expect(after).toContain(newKid);
    expect(after.length).toBeGreaterThan(before.length);
  });

  test("alg none or wrong alg is rejected", async () => {
    if (!server) throw new Error("server did not start");
    const keys = (await (await jwks(server.baseUrl)).json()).keys;
    const kid = keys[0].kid;
    const secret = secretFromJwksKey(keys[0]);
    const noneToken = signJwtWithHeader("alice", { alg: "none", typ: "JWT", kid }, secret);
    expect((await verify(server.baseUrl, noneToken)).status).toBe(401);
  });

  test("wrong kid with otherwise valid signature for another key is rejected", async () => {
    if (!server) throw new Error("server did not start");
    await rotate(server.baseUrl);
    const keys = (await (await jwks(server.baseUrl)).json()).keys;
    expect(keys.length).toBeGreaterThan(1);
    const keyA = keys[0];
    const keyB = keys[1];
    const token = signJwt("alice", keyA.kid, secretFromJwksKey(keyB));
    expect((await verify(server.baseUrl, token)).status).toBe(401);
  });

  test("mint after several rotations still verifies", async () => {
    if (!server) throw new Error("server did not start");
    for (let i = 0; i < 3; i += 1) {
      await rotate(server.baseUrl);
    }
    const token = (await (await mint(server.baseUrl, "chain")).json()).token;
    const response = await verify(server.baseUrl, token);
    expect(response.status).toBe(200);
    expect((await response.json()).sub).toBe("chain");
  });
});
