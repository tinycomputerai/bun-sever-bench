# Keyset-Paginated Event Feed

Build a Bun HTTP service that stores an in-memory event feed and serves it with
keyset (cursor) pagination, newest-first.

## Requirements

- Listen on the port provided by `PORT`.
- Storage is in-memory only; no database or persistence is required.
- Each event has an integer `id` (server-assigned, monotonic, starting at `1`
  and increasing by one per created event), a string `message`, and an integer
  `created_at` (creation time in milliseconds since the epoch).

### Endpoints

`POST /events` — append an event to the feed.

- Request body: `{ "message": string }`.
- On success return `201` with `{ "id": number, "message": string, "created_at": number }`.
- Invalid JSON, a missing `message`, or a `message` that is not a string → `422`
  with a JSON error body.

`GET /events` — read a page of the feed, newest first.

- Query parameters:
  - `limit` — maximum number of items to return. Default `10`. If `limit` is
    greater than `100`, clamp it to `100`. If `limit` is less than or equal to
    `0`, or is not an integer, return `400` with `{ "error": "invalid_limit" }`.
  - `cursor` — an opaque pagination token. Optional. When present it must be a
    token previously returned by this service in `next_cursor`. A garbage,
    malformed, or forged cursor → `400` with `{ "error": "invalid_cursor" }`.
- Response `200` with:
  ```json
  { "items": [ /* events, newest first, ordered by id descending */ ],
    "next_cursor": "<opaque token>" | null }
  ```
- Each item has the same shape as a created event:
  `{ "id", "message", "created_at" }`.
- Paging semantics (keyset):
  - With no `cursor`, return the newest `limit` events (ids highest-first).
  - The cursor encodes the `id` of the last item of the previous page. A request
    with `cursor=C` returns events whose `id` is strictly less than the id
    decoded from `C`, again ordered by id descending, up to `limit` items.
  - `next_cursor`: if this page returned exactly `limit` items, set it to the
    opaque encoding of the **last returned item's id**; if this page returned
    fewer than `limit` items, it is the final page and `next_cursor` is `null`.
    (A full page that happens to exhaust the feed still gets a non-null
    `next_cursor`; fetching that cursor then returns an empty page with a
    `null` cursor.)
- The cursor token is opaque to clients: it is the base64url encoding of the
  decimal id of the boundary item. It MUST round-trip through your own encoder
  and decoder; do not expose the raw id directly.
- With an empty feed (or when a cursor points past the end), return `200` with
  `{ "items": [], "next_cursor": null }`.

## Notes

- Ordering is strictly by `id` descending (newest first). Because ids are
  assigned monotonically, inserting new events after a client has started paging
  must NOT cause any already-seen older event to be skipped or duplicated on a
  later page fetched via the cursor.
- Return JSON for every response.

## Summary

Build an in-memory event feed with newest-first keyset cursor pagination.

## Constraints

- The service must listen on the port provided by PORT.
- Storage is in-memory; no persistence is required.
- Cursors must be opaque tokens that round-trip through the service.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- No external database is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not expose the raw boundary id as the cursor without encoding.
