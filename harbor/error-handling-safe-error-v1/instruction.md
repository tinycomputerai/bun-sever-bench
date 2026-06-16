# Safe JSON Error Responses

Implement a Bun HTTP service with stable JSON errors.

## Requirements

- Listen on the port provided by `PORT`.
- `GET /health` returns HTTP 200 with:

```json
{ "ok": true }
```

- `GET /boom` returns HTTP 500 with:

```json
{ "error": "internal_error" }
```

- Unsupported routes return HTTP 404 with:

```json
{ "error": "not_found" }
```

- Do not expose stack traces in response bodies.

## Summary

Implement safe JSON errors for /boom and unknown routes.

## Constraints

- The service must listen on the port provided by PORT.
- GET /boom returns HTTP 500 with a stable JSON error.
- GET /health returns HTTP 200 with JSON.
- Unsupported routes return HTTP 404 with JSON.

## Allowed assumptions

- The process starts from the task root.
- No persistence is required.

## Disallowed shortcuts

- Do not expose stack traces.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
