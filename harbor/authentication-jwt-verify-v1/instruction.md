# Manual JWT Verification with Algorithm Pinning

Build a Bun HTTP service that verifies HS256 JSON Web Tokens by hand (no JWT
libraries) and defends against algorithm-confusion attacks.

## Requirements

- Listen on the port provided by `PORT`.
- The signing secret comes from the environment variable `JWT_SECRET`. When it is
  not set, default to the literal string `bun-bench-secret`. Verification uses
  HMAC-SHA256 over `base64url(header) + "." + base64url(payload)`.
- A JWT has three dot-separated, base64url-encoded segments:
  `header.payload.signature`.

### Endpoints

`GET /me` — return the caller's claims after verifying their bearer token.

The request must carry `Authorization: Bearer <jwt>`. Apply these checks **in this
exact order** and return the first failure:

1. **Missing token** — no `Authorization` header, or it is not a `Bearer <token>`
   value → `401` with `{ "error": "missing_token" }`.
2. **Malformed** — the token does not have exactly three non-empty segments, or
   the header/payload segments are not valid base64url-encoded JSON →
   `401` with `{ "error": "malformed" }`.
3. **Algorithm** — the decoded header's `alg` field MUST be exactly the string
   `"HS256"`. Any other value (including `"none"`, `"HS384"`, `"HS512"`, `"RS256"`,
   or a missing `alg`) → `401` with `{ "error": "invalid_alg" }`.
4. **Signature** — recompute the HMAC-SHA256 signature over the
   `header.payload` portion using the secret and compare it (constant-time) to the
   token's signature segment. On mismatch → `401` with
   `{ "error": "invalid_signature" }`.
5. **Expiry** — if the payload contains an `exp` claim (seconds since the Unix
   epoch), and that time is in the past (`exp <= now`), → `401` with
   `{ "error": "expired" }`.
6. **Subject** — the payload MUST contain a `sub` claim. If it is absent →
   `401` with `{ "error": "malformed" }`.

On success → `200` with the decoded payload claims as the JSON body. The body
MUST include at least the `sub` claim (return the full decoded payload).

## Notes

- Reject the `alg: "none"` token even when the signature segment is empty — the
  algorithm check happens before the service would ever skip signature
  verification.
- A token signed with HMAC-SHA512 (`alg: "HS512"`) using the same secret MUST be
  rejected at the algorithm step, even though its signature would otherwise be
  computable from the secret.
- Comparing signatures must not leak timing information; use a constant-time
  comparison.
- Do not expose stack traces. Return JSON for every response.

## Summary

Verify HS256 JWTs manually with node:crypto and pin the algorithm to HS256.

## Constraints

- The service must listen on the port provided by PORT.
- Use the signing secret from JWT_SECRET, defaulting to bun-bench-secret.
- Verify HMAC-SHA256 over the base64url header.payload signing input.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- node:crypto is available; no JWT library is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not skip the algorithm check for tokens that present no signature.
