# Idempotent Payment Capture

Build a Bun HTTP service that captures payments idempotently. Clients send an
`Idempotency-Key` so that retried requests never create duplicate payments, even
when several retries arrive at the same time. State is kept in memory.

## Requirements

- Listen on the port provided by `PORT`.
- Store payments in memory (no database, no files). State does not need to
  survive a restart.
- A payment has an `id` (a unique string — a UUID or a monotonic value), an
  integer `amount`, a string `currency`, and a `status` of `"captured"`.

### Endpoints

`GET /healthz` — liveness/readiness probe.

- Response `200` with `{ "ok": true }`.

`POST /payments` — capture a payment.

- The request MUST include an `Idempotency-Key` header.
- Request body: `{ "amount": integer, "currency": string }`.
- If the `Idempotency-Key` header is absent → `400` with
  `{ "error": "missing_idempotency_key" }`.
- If the body is invalid — `amount` is missing, not an integer, or `<= 0`, or
  `currency` is missing or not a string → `422`.
- First request for a given key (valid body): create a payment with
  `status` `"captured"`, remember the response together with a fingerprint of
  the request body (its `amount` and `currency`), and respond `201` with
  `{ "id", "amount", "currency", "status": "captured" }`.
- Replay — the SAME key with a body that has the same `amount` and `currency` as
  the stored request: return the ORIGINAL stored response unchanged (same `id`,
  same `201` status, same body) and add the header `Idempotency-Replayed: true`.
- Conflict — the SAME key with a body whose `amount` or `currency` differs from
  the stored request: respond `409` with `{ "error": "idempotency_key_reuse" }`.

`GET /payments/:id` — read a payment.

- Response `200` with the payment `{ "id", "amount", "currency", "status" }`.
- Unknown id → `404`.

## Notes

- Concurrency: when several `POST /payments` requests carry the same key and the
  same body at the same time, EXACTLY ONE payment must be created. Every
  successful response for that key must carry the same `id`; the service must
  never produce two different payment ids for one key. Serialize work per key
  (for example with a per-key in-flight promise) so a concurrent burst collapses
  into a single capture.
- Validation order: a missing `Idempotency-Key` (`400`) is reported before body
  validation. The body is validated before any payment is created.
- Return JSON for every response.

## Summary

Build an idempotent payment capture API keyed on Idempotency-Key with concurrency-safe single execution.

## Constraints

- The service must listen on the port provided by PORT.
- Store payments in memory; persistence across restart is not required.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- State is held in process memory.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not create more than one payment for a single key.
