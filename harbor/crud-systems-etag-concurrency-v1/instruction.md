# Configuration Store with Strong ETag Optimistic Concurrency

Build a Bun HTTP service that stores configuration entries in memory and guards
updates with optimistic concurrency control using **strong content-hash ETags**
and RFC 7232 conditional-request semantics.

## Requirements

- Listen on the port provided by `PORT`.
- Store entries in memory (no database required).
- An entry has a string `id`, a string `key`, and a string `value`.
- Every entry has a **strong ETag** that is a content hash of its current
  contents. The ETag is the lowercase hex SHA-256 of a canonical serialization
  of `{ key, value }`, wrapped in double quotes, e.g. `"a1b2…<64 hex chars>"`.
  The ETag MUST be deterministic: the same `key`/`value` always produces the
  same ETag, and changing either `key` or `value` changes the ETag.

### Canonical serialization

Hash the JSON object `{"key":<key>,"value":<value>}` with the `key` field
emitted before the `value` field. The SHA-256 of that exact byte string,
rendered as lowercase hex and wrapped in double quotes, is the ETag.

### Endpoints

`POST /configs` — create an entry.

- Request body: `{ "key": string, "value": string }`.
- Response `201` with `{ "id", "key", "value" }` and an `ETag` header equal to
  the strong content hash described above.
- Invalid JSON or missing/!string `key` or `value` → `422`.

`GET /configs/:id` — read an entry.

- Response `200` with `{ "id", "key", "value" }` and an `ETag` header equal to
  the current content hash.
- Unknown id → `404`. (For example, `GET /configs/unknown-id` → `404`.)

`PUT /configs/:id` — update an entry, guarded by `If-Match`.

- Body may contain `key` and/or `value`; omitted fields are left unchanged.
- Comparison rule: compare the `If-Match` value against the current ETag
  ignoring surrounding double quotes and an optional leading `W/` weak prefix.
- If `If-Match` matches the current content ETag: apply the update, return `200`
  with the updated entry `{ "id", "key", "value" }` and an `ETag` header equal
  to the NEW content hash.
- If `If-Match` is `*` (wildcard): the precondition matches any existing entry;
  apply the update and return `200` with the new `ETag`.
- If `If-Match` is present but does NOT match the current ETag: return `412`
  with `{ "error": "precondition_failed" }`.
- If `If-Match` is absent: return `428` with
  `{ "error": "precondition_required" }`.
- Unknown id → `404`.

## Notes

- Two concurrent updates that present the same original ETag must not both
  succeed. Exactly one wins (`200`); the other receives `412`. After the first
  update the entry's ETag changes, so the second request's precondition is
  stale.
- A previously captured ETag becomes stale once the entry is updated; presenting
  it afterward yields `412`.
- Return JSON for every response.

## Summary

Build an in-memory config store with strong content-hash ETag If-Match concurrency.

## Constraints

- The service must listen on the port provided by PORT.
- The ETag must be a deterministic content hash of the entry's key and value.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- In-memory storage is acceptable; no database is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not use a counter or random value as the ETag instead of a content hash.
