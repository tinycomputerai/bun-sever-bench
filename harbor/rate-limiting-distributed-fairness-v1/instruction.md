# Distributed Rate Limiter with Fairness

Build a Bun HTTP service implementing a **shared** per-client rate limiter (simulating
multiple handlers/instances backed by one store). Enforce a global limit atomically,
return standard rate-limit headers, and use a single server clock so client clock skew
cannot grant extra budget.

## Requirements

- Listen on the port provided by `PORT`.
- State is kept in memory (shared store).
- **Limit**: 10 requests per 1000 ms window **per client**.
- Return JSON for every response.

### Endpoints

`GET /healthz` — readiness probe → `200` with `{ "ok": true }`.

`GET /clock` — shared monotonic clock used for limit math → `200` with `{ "now_ms": number }`.

`GET /resource` — protected resource.

- Requires header `X-Client-Id: <string>`. Missing → `400` `{ "error": "missing_client_id" }`.
- Allowed → `200` `{ "ok": true }` with headers:
  - `X-RateLimit-Limit: 10`
  - `X-RateLimit-Remaining: <non-negative integer>`
  - `X-RateLimit-Reset: <unix seconds when the window resets>`
- Denied → `429` `{ "error": "rate_limited" }` with the same limit headers (remaining `0`)
  plus `Retry-After: <seconds>` (integer ≥ 1).

### Shared-store rules

- All concurrent requests share one counter per client id (simulate distributed handlers
  using one atomic store).
- **Atomic admission**: two concurrent requests consuming the last remaining slot MUST
  NOT both succeed (no TOCTOU over-admission).
- **Window rollover**: after the window elapses, the client gets a fresh budget of 10 —
  not double-refilled under concurrency.
- **Clock discipline**: rate math MUST use the server's clock (`GET /clock`). Ignore
  client time hints such as `X-Client-Time`; skew MUST NOT increase allowance.
- **Fairness**: one client's burst MUST NOT reduce another client's budget.

## Notes

- Do not serialize unrelated clients behind one global mutex.
- Do not expose stack traces.

## Summary

Enforce a shared per-client 10 rps limit with atomic admission and fairness.

## Constraints

- The service must listen on the port provided by PORT.
- Limit is 10 requests per 1000 ms per X-Client-Id.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- All handlers share one in-memory store in the process.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not use per-request local counters without shared state.
