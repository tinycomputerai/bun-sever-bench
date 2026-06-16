# Request Id Propagation Middleware

Implement a Bun HTTP service that propagates request ids.

## Requirements

- Listen on the port provided by `PORT`.
- `GET /request-id` requires an `X-Request-Id` request header.
- When present, return HTTP 200 with:

```json
{ "requestId": "the-header-value" }
```

- The response must also include the same `X-Request-Id` header value.
- Missing `X-Request-Id` returns HTTP 400 with:

```json
{ "error": "bad_request" }
```

- Unsupported paths or methods must return HTTP 404 with JSON.

## Summary

Echo X-Request-Id in the response header and JSON body.

## Constraints

- The service must listen on the port provided by PORT.
- GET /request-id requires an X-Request-Id request header.
- The response must include the same X-Request-Id header value.
- Missing X-Request-Id returns HTTP 400 with JSON.

## Allowed assumptions

- The process starts from the task root.
- No persistence is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
