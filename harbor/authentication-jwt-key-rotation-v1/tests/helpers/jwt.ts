import { createHmac } from "node:crypto";

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function signJwt(sub: string, kid: string, secret: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub, iat: now, exp: now + 3600 }));
  const signingInput = `${header}.${payload}`;
  const sig = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${sig}`;
}

export function signJwtWithHeader(
  sub: string,
  headerFields: Record<string, unknown>,
  secret: string,
): string {
  const header = b64url(JSON.stringify(headerFields));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({ sub, iat: now, exp: now + 3600 }));
  const signingInput = `${header}.${payload}`;
  const sig = createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${sig}`;
}
