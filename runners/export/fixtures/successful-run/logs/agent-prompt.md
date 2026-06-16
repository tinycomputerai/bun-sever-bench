# Bearer Token Profile Endpoint

Implement a Bun HTTP service with one authenticated profile endpoint.

## Summary

Implement GET /profile guarded by a bearer token.

## Constraints

- The service must listen on the port provided by PORT.
- Authorization: Bearer benchmark-token grants access.
- Missing or invalid tokens return HTTP 401 with JSON.
- Successful responses return HTTP 200 with a profile JSON body.
