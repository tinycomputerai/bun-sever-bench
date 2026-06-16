# Todo Service Health Endpoint

Implement a Bun HTTP service for a todo system health check.

## Requirements

- The service must listen on the port provided by the `PORT` environment variable.
- `GET /health` must return HTTP 200.
- `GET /health` must return the exact JSON body:

```json
{ "ok": true }
```

- Query parameters on `/health` must not change the response.
- Unsupported paths or methods must return HTTP 404 with a JSON response body.
- Do not require external network access.

## Commands

- Start the service with `bun run start`.
- Run the public tests with `bun test tests/public`.

## Summary

Implement GET /health for a Bun HTTP service.

## Constraints

- The service must listen on the port provided by PORT.
- GET /health must return HTTP 200 and the exact JSON body {"ok": true}.
- Unsupported paths or methods must return HTTP 404 with a JSON body.
- Do not require external network access.

## Allowed assumptions

- The process starts from the task root.
- No persistence is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test file names.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
