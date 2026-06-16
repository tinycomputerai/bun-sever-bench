# Consistent Snapshot Pagination

Build a Bun HTTP service that lists items with cursor pagination sorted by
`(updated_at ascending, id ascending)` while the dataset mutates during traversal.
Each pagination session MUST present a consistent snapshot view: no skipped items,
no duplicates, and stable cursors even when items are updated or deleted mid-traversal.

## Requirements

- Listen on the port provided by `PORT`.
- State is kept in memory.
- Return JSON for every response.

### Data model

Items have `id`, `name`, and `updated_at` (milliseconds). Sort key is
`(updated_at, id)` ascending.

### Endpoints

`GET /healthz` — readiness probe → `200` with `{ "ok": true }`.

`POST /items` — create an item.

- Body: `{ "name": string }` (non-empty).
- Returns `201` with `{ "id", "name", "updated_at" }`.

`PATCH /items/:id` — update an item's name.

- Body: `{ "name": string }` (non-empty).
- Bumps `updated_at` to the current time (which may move the item forward in sort order).
- Returns `200` with the updated item.
- Unknown id → `404`.

`DELETE /items/:id` — soft-delete an item.

- Returns `200` with `{ "id", "deleted": true }`.
- Unknown id → `404`.

`GET /items?snapshot=&cursor=&limit=` — paginate within a snapshot.

- **First page**: omit `snapshot` (and `cursor`). The server creates a snapshot of the
  current dataset and returns `{ "snapshot": string, "items": [...], "next_cursor": string | null }`.
- **Later pages**: pass the same `snapshot` and the `next_cursor` from the prior page.
- Each item in `items` includes `{ "id", "name", "updated_at" }`.
- Items are ordered by `(updated_at, id)` ascending within the snapshot.
- `limit` defaults to 10; integers `1..100` only; invalid → `400` `{ "error": "invalid_limit" }`.
- Malformed cursor, cursor from a different snapshot, or unknown snapshot → `400`
  with `{ "error": "invalid_cursor" }` or `{ "error": "invalid_snapshot" }`.

### Snapshot semantics

- A snapshot freezes the item set and each item's `(updated_at, id)` at creation time.
- Mutations after the snapshot (create, update, delete) MUST NOT cause duplicates or
  skips across pages of that snapshot.
- An item updated after page 1 (moving its live sort key forward) MUST NOT reappear on
  a later page of the same snapshot.
- Inserts after the snapshot MUST NOT appear in that snapshot's pages.
- A cursor whose anchor item is deleted live MUST remain valid for the next page (no crash).

## Notes

- Do not use offset pagination.
- Cursors MUST be opaque and bind to the snapshot id.
- Do not expose stack traces.

## Summary

Paginate items with snapshot-bound cursors under live mutation.

## Constraints

- The service must listen on the port provided by PORT.
- Sort by (updated_at, id) ascending within a snapshot.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- State is held in process memory.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not use offset pagination.
