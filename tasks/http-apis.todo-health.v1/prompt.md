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
