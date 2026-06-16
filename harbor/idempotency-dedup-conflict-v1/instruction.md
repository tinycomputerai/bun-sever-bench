# Idempotent Order Creation with Business Deduplication

Build a Bun HTTP service that creates orders. It must distinguish two different
kinds of conflict: an idempotency-key replay (the same client retrying) versus a
business-level uniqueness violation (a `reference` that already exists, sent
under a different key). State is kept in memory.

## Requirements

- Listen on the port provided by `PORT`.
- Store orders in memory (no database, no files). State does not need to survive
  a restart.
- An order has an `id` (a unique string — a UUID or a monotonic value), a string
  `reference`, a string `item`, an integer `qty`, and a `status` of `"created"`.

### Endpoints

`GET /healthz` — liveness/readiness probe.

- Response `200` with `{ "ok": true }`.

`POST /orders` — create an order.

- The request MUST include an `Idempotency-Key` header.
- Request body: `{ "reference": string, "item": string, "qty": integer }`.
- If the `Idempotency-Key` header is absent → `400` with
  `{ "error": "missing_idempotency_key" }`.
- If the body is invalid — `reference` missing or not a string, `item` missing
  or not a string, or `qty` missing, not an integer, or `<= 0` → `422`.
- New key (valid body) whose `reference` has not been used: create an order with
  `status` `"created"`, remember the response together with a fingerprint of the
  request body (`reference`, `item`, `qty`), record that the `reference` is now
  taken, and respond `201` with
  `{ "id", "reference", "item", "qty", "status": "created" }`.
- Replay — the SAME key with a body equal to the stored request: return the
  ORIGINAL stored response unchanged (same `id`, same `201` status, same body)
  and add the header `Idempotency-Replayed: true`.
- Key reuse — the SAME key with a body that differs from the stored request:
  respond `409` with `{ "error": "idempotency_key_reuse" }`.
- Duplicate reference — a NEW (previously unseen) key whose `reference` already
  belongs to an existing order: respond `409` with
  `{ "error": "duplicate_reference" }`. This business-uniqueness check is
  separate from idempotency-key reuse.

`GET /orders/:id` — read an order.

- Response `200` with the order `{ "id", "reference", "item", "qty", "status" }`.
- Unknown id → `404`.

## Notes

- The two `409` reasons are independent. A retry under the same key with the same
  body is always a replay (never `duplicate_reference`). A request under a fresh
  key that collides with an existing `reference` is always `duplicate_reference`
  (never `idempotency_key_reuse`).
- Validation order: a missing `Idempotency-Key` (`400`) is reported before body
  validation (`422`), and both are checked before any conflict logic.
- Return JSON for every response.

## Summary

Build an order-create API that distinguishes idempotency-key replay/reuse from a duplicate business reference.

## Constraints

- The service must listen on the port provided by PORT.
- Store orders in memory; persistence across restart is not required.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- State is held in process memory.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not conflate the two distinct 409 conflict reasons.
