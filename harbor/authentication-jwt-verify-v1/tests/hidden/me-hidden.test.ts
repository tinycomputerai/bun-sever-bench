import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { startTaskServer, type RunningServer } from "../helpers/server";

const SECRET = "bun-bench-secret";

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

// Self-contained JWT signer: tests mint their own tokens with the known secret.
function signJwt(
  payload: Record<string, unknown>,
  opts: { alg?: string; secret?: string } = {},
): string {
  const alg = opts.alg ?? "HS256";
  const secret = opts.secret ?? SECRET;
  const header = b64url(JSON.stringify({ alg, typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const hmacAlg = alg === "HS512" ? "sha512" : "sha256";
  const sig = createHmac(hmacAlg, secret).update(signingInput).digest("base64url");
  return `${signingInput}.${sig}`;
}

function nowPlus(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

async function getMe(baseUrl: string, token: string) {
  return fetch(`${baseUrl}/me`, { headers: { authorization: `Bearer ${token}` } });
}

describe("jwt-verify hardening", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("tampered payload (re-encoded) with the original signature is invalid_signature", async () => {
    if (!server) throw new Error("server did not start");
    const token = signJwt({ sub: "alice", role: "user", exp: nowPlus(3600) });
    const [header, , sig] = token.split(".");
    // Re-encode the payload with escalated claims but keep the old signature.
    const forgedPayload = b64url(JSON.stringify({ sub: "alice", role: "admin", exp: nowPlus(3600) }));
    const forged = `${header}.${forgedPayload}.${sig}`;
    const response = await getMe(server.baseUrl, forged);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_signature");
  });

  test("an expired token is rejected with expired", async () => {
    if (!server) throw new Error("server did not start");
    const token = signJwt({ sub: "alice", exp: nowPlus(-10) });
    const response = await getMe(server.baseUrl, token);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("expired");
  });

  test('alg:"none" token (empty signature) is rejected as invalid_alg, not accepted', async () => {
    if (!server) throw new Error("server did not start");
    const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const body = b64url(JSON.stringify({ sub: "alice", exp: nowPlus(3600) }));
    const token = `${header}.${body}.`;
    const response = await getMe(server.baseUrl, token);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_alg");
  });

  test('alg:"none" token with a fabricated signature is still invalid_alg', async () => {
    if (!server) throw new Error("server did not start");
    const header = b64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const body = b64url(JSON.stringify({ sub: "alice", exp: nowPlus(3600) }));
    const token = `${header}.${body}.${b64url("anything")}`;
    const response = await getMe(server.baseUrl, token);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_alg");
  });

  test("HS512 token signed with the same secret is rejected as invalid_alg", async () => {
    if (!server) throw new Error("server did not start");
    const token = signJwt({ sub: "alice", exp: nowPlus(3600) }, { alg: "HS512" });
    const response = await getMe(server.baseUrl, token);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_alg");
  });

  test("a Bearer-less Authorization header is missing_token", async () => {
    if (!server) throw new Error("server did not start");
    const token = signJwt({ sub: "alice", exp: nowPlus(3600) });
    const response = await fetch(`${server.baseUrl}/me`, {
      headers: { authorization: token },
    });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("missing_token");
  });

  test("a token with only two segments is malformed", async () => {
    if (!server) throw new Error("server did not start");
    const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify({ sub: "alice" }));
    const response = await getMe(server.baseUrl, `${header}.${body}`);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("malformed");
  });

  test("a valid HS256 token missing sub is malformed", async () => {
    if (!server) throw new Error("server did not start");
    const token = signJwt({ name: "alice", exp: nowPlus(3600) });
    const response = await getMe(server.baseUrl, token);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("malformed");
  });

  test("algorithm check runs before signature check (none alg with valid-looking sub)", async () => {
    if (!server) throw new Error("server did not start");
    // Even a correctly HS256-signed body, if the header advertises a different
    // alg, must be rejected at the alg step.
    const header = b64url(JSON.stringify({ alg: "HS384", typ: "JWT" }));
    const body = b64url(JSON.stringify({ sub: "alice", exp: nowPlus(3600) }));
    const signingInput = `${header}.${body}`;
    const sig = createHmac("sha256", SECRET).update(signingInput).digest("base64url");
    const response = await getMe(server.baseUrl, `${signingInput}.${sig}`);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_alg");
  });

  test("a valid unexpired token with sub returns 200 and the sub", async () => {
    if (!server) throw new Error("server did not start");
    const token = signJwt({ sub: "bob", exp: nowPlus(3600), scope: "read" });
    const response = await getMe(server.baseUrl, token);
    expect(response.status).toBe(200);
    const claims = await response.json();
    expect(claims.sub).toBe("bob");
    expect(claims.scope).toBe("read");
  });
});
