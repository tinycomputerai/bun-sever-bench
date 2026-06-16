# JWT Verification with Rotating Signing Keys

Build a Bun HTTP service that verifies HS256 JSON Web Tokens against a rotating
key set identified by the `kid` header. New signing keys are introduced via
rotation; previous keys remain valid until explicitly retired. Verification must
select the correct key by `kid` only — never try every key or accept tokens
without a `kid`.

## Requirements

- Listen on the port provided by `PORT`.
- State is kept in memory (no database).
- The service boots with one active signing key (`key-bootstrap`).
- Signing keys are symmetric octet keys used with HS256.
- Return JSON for every response.

### Endpoints

`GET /healthz` — readiness probe → `200` with `{ "ok": true }`.

`GET /.well-known/jwks` — expose current verification keys.

- Returns `200` with `{ "keys": [ ... ] }`.
- Each key object includes: `kid`, `kty` (`"oct"`), `alg` (`"HS256"`), `use`
  (`"sig"`), and `k` (base64url-encoded secret material).
- Only **non-retired** keys appear in the JWKS.
- The JWKS response may be cached internally; the cache MUST be invalidated when
  keys are rotated or retired so freshly rotated keys verify immediately.

`POST /keys/rotate` — introduce a new active signing key.

- Returns `200` with `{ "kid": string, "active": true }`.
- The new key becomes the active key for minting.
- All previously active (non-retired) keys remain valid for verification until
  retired.

`POST /keys/:kid/retire` — retire a key by `kid`.

- Valid, known `kid` → `200` with `{ "kid": string, "status": "retired" }`.
- Unknown `kid` → `404` with `{ "error": "unknown_kid" }`.
- Malformed `kid` (contains `/`, `..`, non-alphanumeric characters other than
  `-` and `_`, or exceeds 64 characters) → `400` with `{ "error": "invalid_kid" }`.
- After retirement, tokens signed with that `kid` MUST be rejected.

`POST /mint` — issue a JWT signed with the current active key (for testing and
integration).

- Request body: `{ "sub": string }`.
- Returns `200` with `{ "token": string }`.
- The JWT header MUST include `{ "alg": "HS256", "typ": "JWT", "kid": <active> }`.

`POST /verify` — verify a bearer JWT.

- Requires `Authorization: Bearer <jwt>`.
- Valid token signed with a non-retired key whose `kid` matches the header →
  `200` with `{ "sub": string }`.
- Missing/invalid token, wrong signature, expired token, unknown `kid`, retired
  `kid`, missing `kid`, or `alg` other than `HS256` → `401` with
  `{ "error": "unauthorized" }`.
- Do NOT fall back to another key when the header `kid` does not match or is
  unknown.

## Notes

- Overlap window: after rotation, tokens minted under the previous key MUST still
  verify until that key is retired.
- After retirement, tokens bearing that `kid` MUST fail even if the signature
  is otherwise valid.
- Reject `kid` values that look like path traversal or injection attempts.
- Do not expose stack traces.

## Summary

Verify JWTs against a rotating JWKS key set with overlap and retirement.

## Constraints

- The service must listen on the port provided by PORT.
- Use HS256 symmetric keys identified by kid in the JWT header.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- node:crypto is available; no JWT library is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not verify by trying every key when kid is unknown or retired.
