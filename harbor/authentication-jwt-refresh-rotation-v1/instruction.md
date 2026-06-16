# Refresh-Token Rotation with Reuse Detection

Build a Bun HTTP service that issues short-lived access tokens alongside
rotating refresh tokens, and detects refresh-token reuse by revoking the entire
token family.

## Requirements

- Listen on the port provided by `PORT`.
- State is kept in memory (no database). There is exactly one credential:
  username `alice`, password `password123`.
- Access tokens are HS256 JSON Web Tokens signed with HMAC-SHA256 using the
  secret `bun-bench-secret`, with a short expiry (a few minutes). Each access
  token's `sub` claim is the username.
- Refresh tokens are opaque, unguessable random strings (use `node:crypto`).
  Each refresh token belongs to a token **family** created at login. A family
  has at most one currently-valid refresh token at a time.

### Endpoints

`POST /login` — exchange credentials for a token pair.

- Request body: `{ "username": string, "password": string }`.
- Correct credentials → `200` with
  `{ "access_token": <jwt>, "refresh_token": <opaque> }`. This starts a new
  token family whose first valid refresh token is the returned one.
- Wrong username or password → `401` with `{ "error": "invalid_credentials" }`.

`POST /refresh` — rotate a refresh token.

- Request body: `{ "refresh_token": string }`.
- If the token is the currently-valid refresh token of its family: issue a NEW
  `{ "access_token", "refresh_token" }` pair → `200`. The presented refresh
  token is now consumed and MUST NOT work again; the newly issued refresh token
  becomes the family's only valid token.
- If the token is unknown (never issued by this service) → `401` with
  `{ "error": "invalid_refresh" }`.
- If the token was already rotated out of its family (i.e. it was a valid
  refresh token that has since been consumed) → this is **reuse**. Revoke the
  ENTIRE family: every refresh token in that family, including the
  currently-valid one, becomes invalid. Return `401` with
  `{ "error": "token_reuse_detected" }`. Subsequent refresh attempts with any
  token from that family → `401` (`invalid_refresh` once the family is dead).

`GET /protected` — a resource guarded by the access token.

- Requires `Authorization: Bearer <access_token>`.
- A valid, unexpired access token → `200` with `{ "sub": "alice" }`.
- A missing, malformed, invalid-signature, or expired access token → `401`.

`GET /healthz` — readiness probe → `200` with `{ "ok": true }`.

## Notes

- Rotation must be atomic per family: presenting an already-consumed refresh
  token must trigger family-wide revocation, not merely fail.
- Once a family is revoked due to reuse, even its most recently issued
  (otherwise valid-looking) refresh token must stop working.
- Do not expose stack traces. Return JSON for every response.

## Summary

Issue rotating refresh tokens with reuse detection and family revocation.

## Constraints

- The service must listen on the port provided by PORT.
- Sign access tokens with HS256 using the secret bun-bench-secret.
- Refresh tokens are opaque random strings kept in memory.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- node:crypto is available; no JWT or session library is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not accept a refresh token more than once.
