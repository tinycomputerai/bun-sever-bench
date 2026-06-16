# Read-Through Cache with Stampede Protection

Build a Bun HTTP service implementing a read-through cache in front of an expensive
computation. Prevent thundering-herd stampedes via single-flight, serve
stale-while-revalidate after TTL, cache negative results briefly, and keep per-key
isolation with bounded memory.

## Requirements

- Listen on the port provided by `PORT`.
- State is kept in memory.
- Return JSON for every response.

### Constants

- **TTL**: 300 ms — fresh cache lifetime for successful values.
- **Negative TTL**: 150 ms — how long a failed computation is cached.
- **Max entries**: 20 — LRU eviction when exceeded.
- **Compute delay**: each actual computation waits ~10 ms (simulate expensive work).

### Endpoints

`GET /healthz` — readiness probe → `200` with `{ "ok": true }`.

`GET /compute/:key` — read-through cache lookup.

- Successful computation → `200` with `{ "value": string, "cached": boolean }`.
  `cached: false` on a fresh compute; `cached: true` when served from cache
  (including stale-while-revalidate).
- Keys starting with `fail-` cause the computation to fail → `503` with
  `{ "error": "compute_failed", "cached": boolean }`. Failures are negative-cached
  for the negative TTL, then retried.
- **Single-flight**: concurrent misses for the same key invoke the expensive
  computation exactly once; all waiters receive the same result.
- **Stale-while-revalidate**: after TTL expiry, return the stale value immediately
  (`cached: true`) while exactly one background refresh runs.
- **Per-key isolation**: single-flight on key A must not block key B.
- Distinct keys MUST NOT collide.

`GET /stats` — instrumentation for tests.

- Returns `200` with `{ "invocations": { [key: string]: number } }` counting how
  many times the expensive computation actually ran per key.

## Notes

- Do not disable caching entirely to dodge invalidation tests.
- Negative failures must recover after the negative TTL (not pinned forever).
- Do not expose stack traces.

## Summary

Build a stampede-safe read-through cache with SWR and negative caching.

## Constraints

- The service must listen on the port provided by PORT.
- Expose compute invocation counts via GET /stats.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- State is held in process memory.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not use a global lock that serializes unrelated keys.
