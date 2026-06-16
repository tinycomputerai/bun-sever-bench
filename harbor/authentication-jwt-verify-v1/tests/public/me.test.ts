import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { startTaskServer, type RunningServer } from "../helpers/server";

const SECRET = "bun-bench-secret";

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

// Minimal self-contained JWT signer so tests mint their own tokens.
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

describe("jwt-verify GET /me", () => {
  let server: RunningServer | undefined;

  beforeAll(async () => {
    server = await startTaskServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  test("accepts a valid unexpired HS256 token and returns the claims", async () => {
    if (!server) throw new Error("server did not start");
    const token = signJwt({ sub: "user-1", exp: nowPlus(3600) });
    const response = await fetch(`${server.baseUrl}/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
    const claims = await response.json();
    expect(claims.sub).toBe("user-1");
  });

  test("rejects a request with no Authorization header as missing_token", async () => {
    if (!server) throw new Error("server did not start");
    const response = await fetch(`${server.baseUrl}/me`);
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("missing_token");
  });

  test("rejects a tampered signature with invalid_signature", async () => {
    if (!server) throw new Error("server did not start");
    const token = signJwt({ sub: "user-1", exp: nowPlus(3600) }, { secret: "wrong-secret" });
    const response = await fetch(`${server.baseUrl}/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_signature");
  });
});
