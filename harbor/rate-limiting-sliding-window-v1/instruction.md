# Sliding Window Rate Limiter

Build a Bun HTTP service that rate-limits requests per client using a **sliding
(rolling) window**.

## Requirements

- Listen on the port provided by `PORT`.
- State lives in memory for the process lifetime, keyed by the `X-Client-Id`
  request header. Each client id is limited independently.
- The limit is **5 requests per rolling 1000 ms window**, per client.

### Endpoint

`GET /resource`

- If the `X-Client-Id` header is missing, return `400` with
  `{ "error": "missing_client_id" }`.
- A request is **allowed** if and only if fewer than 5 of that client's
  previously allowed requests fall within the **last 1000 ms** (measured from
  the current instant). Track the timestamps of allowed requests and drop those
  older than 1000 ms.
- On an allowed request, return `200` with body `{ "ok": true }` and headers:
  - `X-RateLimit-Limit: 5`
  - `X-RateLimit-Remaining: <n>` where `<n>` is how many further requests the
    client could make right now (after counting this one).
- On a rejected request, return `429` with body `{ "error": "rate_limited" }`
  and headers:
  - `Retry-After: <seconds>` — an integer number of seconds (at least `1`)
    until the client would be allowed again.
  - `X-RateLimit-Remaining: 0`

## Notes

- The window is rolling, not a fixed calendar window: it always measures the
  most recent 1000 ms relative to now. Five requests made in a burst keep the
  client blocked until the oldest of those five ages out of the 1000 ms window.
- Any path other than `GET /resource` may return `404`.

## Summary

Implement GET /resource with a per-client sliding-window limit of five per 1000ms.

## Constraints

- The service must listen on the port provided by PORT.
- GET /resource requires an X-Client-Id header.
- Allow at most five requests per rolling 1000ms window per client.
- A rejected request returns HTTP 429 with JSON and a Retry-After header.

## Allowed assumptions

- The process starts from the task root.
- State only needs to live in memory for the process lifetime.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not use a fixed calendar window that resets on a boundary.
