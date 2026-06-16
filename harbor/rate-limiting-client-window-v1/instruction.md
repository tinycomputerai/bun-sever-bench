# Client Fixed Window Rate Limit

Implement a Bun HTTP service with a simple per-client rate limit.

## Requirements

- Listen on the port provided by `PORT`.
- `GET /limited` requires an `X-Client-Id` header.
- Each client id may make two successful requests.
- Successful requests return HTTP 200 with:

```json
{ "ok": true, "remaining": 1 }
```

- The third request from the same client returns HTTP 429 with:

```json
{ "error": "rate_limited" }
```

- Missing `X-Client-Id` returns HTTP 400 with JSON.

## Summary

Implement GET /limited with a per-client request limit of two.

## Constraints

- The service must listen on the port provided by PORT.
- GET /limited requires an X-Client-Id header.
- Each client may make two successful requests.
- The third request from the same client returns HTTP 429 with JSON.

## Allowed assumptions

- The process starts from the task root.
- State only needs to live in memory for the process lifetime.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
