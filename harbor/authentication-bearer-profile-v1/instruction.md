# Bearer Token Profile Endpoint

Implement a Bun HTTP service with one authenticated profile endpoint.

## Requirements

- Listen on the port provided by `PORT`.
- `GET /profile` must require this exact header:

```text
Authorization: Bearer benchmark-token
```

- A valid token returns HTTP 200 with:

```json
{ "id": "user_1", "email": "user@example.com" }
```

- Missing or invalid tokens return HTTP 401 with:

```json
{ "error": "unauthorized" }
```

- All responses must be JSON.

## Summary

Implement GET /profile guarded by a bearer token.

## Constraints

- The service must listen on the port provided by PORT.
- Authorization: Bearer benchmark-token grants access.
- Missing or invalid tokens return HTTP 401 with JSON.
- Successful responses return HTTP 200 with a profile JSON body.

## Allowed assumptions

- The process starts from the task root.
- The only valid token is benchmark-token.

## Disallowed shortcuts

- Do not hard-code behavior based on test names.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
