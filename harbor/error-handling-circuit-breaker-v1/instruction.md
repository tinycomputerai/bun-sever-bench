# Resilient Caller: Retry Semantics with a Circuit Breaker

Build a Bun HTTP service that calls an unreliable in-process dependency, applying
HTTP-method-aware retry semantics and guarding the dependency with a circuit
breaker.

## Requirements

- Listen on the port provided by `PORT`.
- All state is in memory; no persistence and no external network is required.
- Return JSON for every response.

### The dependency (simulated in-process)

The service contains a simulated downstream dependency. It has a **mode** and a
**call counter**:

- `mode` is one of `"up"`, `"down"`, or `"flaky"`. The default mode is `"up"`.
- `"up"` — every invocation succeeds.
- `"down"` — every invocation fails (throws / errors).
- `"flaky"` — every invocation fails until the mode is changed. (Behaves like
  `"down"` while the mode is `"flaky"`; it is a distinct selectable mode.)
- The **call counter** counts how many times the dependency was *actually
  invoked*. It increments on every real invocation regardless of success or
  failure. It is NOT incremented when the breaker is open and the service fails
  fast without touching the dependency.

### `POST /dependency` — set the dependency mode

- Request body: `{ "mode": "up" | "down" | "flaky" }`.
- On success respond `200` with `{ "mode": <mode> }`.
- Invalid JSON or a `mode` that is not one of the three allowed values → `400`
  with `{ "error": "invalid_mode" }`.
- Setting the mode does NOT reset the call counter or the breaker state.

### `GET /call` — idempotent call (retried)

A `GET` is idempotent, so it may be retried safely.

- If the breaker is **open**, fail fast (see Circuit breaker) without invoking
  the dependency.
- Otherwise invoke the dependency. Because the call is idempotent, retry on
  failure up to a total of **3 attempts**, with a tiny backoff between attempts.
- If any attempt succeeds → `200` with `{ "ok": true, "attempts": <n> }` where
  `<n>` is the attempt number that succeeded (1, 2, or 3).
- If all 3 attempts fail → `502` with `{ "error": "upstream_failed", "attempts": 3 }`.
- Each attempt is a real dependency invocation and increments the call counter.
  A fully failed `GET /call` therefore increments the call counter by 3.

### `POST /call` — non-idempotent call (NOT retried)

A `POST` is not idempotent, so it must be invoked **at most once** (no retry).

- If the breaker is **open**, fail fast without invoking the dependency.
- Otherwise invoke the dependency exactly once.
- Success → `200` with `{ "ok": true, "attempts": 1 }`.
- Failure → `502` with `{ "error": "upstream_failed", "attempts": 1 }`.
- A `POST /call` increments the call counter by exactly 1 when it is allowed to
  run.

### Circuit breaker

The breaker tracks **consecutive failures**, counted **per `/call` request**
(NOT per retry attempt):

- A `/call` request that ultimately fails (a `GET /call` that exhausts all
  retries, or a `POST /call` whose single invocation fails) counts as **one**
  consecutive failure.
- A `/call` request that ultimately succeeds resets the consecutive-failure
  count to `0`.

State machine:

- **closed** (initial): calls flow through to the dependency.
- When the consecutive-failure count reaches the **threshold of 5**, the breaker
  **opens**.
- **open**: every `GET`/`POST /call` fails fast with `503`
  `{ "error": "circuit_open" }` and does NOT invoke the dependency (the call
  counter must not change).
- After a cooldown of about **500ms** since the breaker opened, the breaker
  becomes **half_open** and allows the next `/call` through as a single trial
  invocation:
  - If the trial **succeeds** → breaker goes **closed** and the consecutive
    failure count resets to `0`.
  - If the trial **fails** → breaker goes back to **open** and the cooldown
    timer restarts.

A success in either `closed` or `half_open` resets the consecutive-failure
count to `0`.

### `GET /breaker` — breaker status

- Respond `200` with
  `{ "state": "closed" | "open" | "half_open", "consecutive_failures": <int>, "dependency_calls": <int> }`.
- `dependency_calls` is the dependency's call counter.
- This endpoint must work with no prior setup and is used as the readiness
  probe.

## Notes

- Keep the backoff small (a few milliseconds) so retries are fast.
- The breaker must fail fast while open: verify by observing that
  `dependency_calls` does not change across an open-circuit `/call`.
- Be precise about the counting model: failures are counted per `/call`
  request, while the dependency call counter is incremented per actual
  invocation (so a failed `GET /call` is +3 to `dependency_calls` but +1 to the
  consecutive-failure count).

## Summary

Build a resilient caller with method-aware retries and a circuit breaker.

## Constraints

- The service must listen on the port provided by PORT.
- All state is in memory; no persistence or external network is required.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- The downstream dependency is simulated in-process and controlled via POST /dependency.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not open outbound network sockets.
