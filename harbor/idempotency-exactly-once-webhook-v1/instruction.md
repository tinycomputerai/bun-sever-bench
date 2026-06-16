# Exactly-Once Webhook Processing

Build a Bun HTTP service that receives HMAC-signed provider webhooks, applies each
logical event exactly once per resource in **sequence order** (not arrival order),
buffers out-of-order and gap events, and deduplicates retries.

## Requirements

- Listen on the port provided by `PORT`.
- State is kept in memory.
- Webhook signing secret: `webhook-secret`.
- Signature header: `X-Signature: sha256=<hex-hmac>` over the **raw request body**.
- Return JSON for every response.

### Endpoints

`GET /healthz` — readiness probe → `200` with `{ "ok": true }`.

`POST /webhook` — ingest a signed provider event.

- Request body (JSON):
  `{ "event_id": string, "type": "increment" | "set", "resource_id": string, "sequence": positive integer, "data": object }`
- `increment` events add `data.amount` (integer) to the resource balance.
- `set` events set the balance to `data.balance` (integer).
- Valid signature → process per rules below → `200` with
  `{ "ok": true, "resource_id": string, "last_sequence": number }`.
- Invalid or missing signature → `401` with `{ "error": "invalid_signature" }`.
  The event MUST NOT be recorded as processed.
- Invalid body shape → `422`.

Processing rules (per `resource_id`):

1. **Duplicate `event_id`**: return the same `200` ack as the first successful
   processing; do NOT apply the effect again.
2. **Sequence ordering**: apply events in ascending `sequence` order. If event
   sequence `N` arrives before `N-1`, buffer it and ack without advancing state
   past the gap.
3. **Gap**: if sequence jumps ahead (e.g. receive 3 while last applied is 1),
   ack the event (so the provider stops retrying) but do NOT advance
   `last_sequence` or balance until the missing sequence arrives.
4. **Superseded replay**: if `sequence <= last_sequence` for the resource, ack
   without re-applying (idempotent ignore).
5. **Concurrency**: parallel deliveries of the same `event_id` must result in
   exactly one state change.

`GET /resources/:id` — read derived state.

- Returns `200` with
  `{ "resource_id": string, "balance": number, "last_sequence": number }`.
- Unknown resource → `404`.

## Notes

- Verify the HMAC **before** recording or applying an event.
- When a gap-filling event arrives, apply it and then any buffered successors in
  order.
- Do not expose stack traces.

## Summary

Process signed webhooks exactly once with per-resource sequence ordering.

## Constraints

- The service must listen on the port provided by PORT.
- Use webhook secret webhook-secret with X-Signature sha256 HMAC.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- State is held in process memory.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not apply events in arrival order without sequence reconciliation.
