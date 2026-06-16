# Versioned Document Store with Optimistic Concurrency

Build a Bun HTTP service that stores documents in SQLite and guards updates with
optimistic concurrency control.

## Requirements

- Listen on the port provided by `PORT`.
- Persist documents in a SQLite database. Use the file path from `DATABASE_PATH`
  when it is set; otherwise default to `./data/app.db`. Data MUST survive a
  process restart.
- A document has an integer `id`, a string `title`, a string `body`, and an
  integer `version` that starts at `1`.

### Endpoints

`POST /docs` — create a document.

- Request body: `{ "title": string, "body": string }`.
- Response `201` with `{ "id", "title", "body", "version": 1 }` and an
  `ETag` header equal to `"1"` (the version in double quotes).
- Invalid JSON → `400`. Missing/!string `title` or `body` → `422`.

`GET /docs/:id` — read a document.

- Response `200` with the document and an `ETag` header equal to
  `"<version>"`.
- Unknown id → `404`.

`PUT /docs/:id` — update a document, guarded by `If-Match`.

- The client MUST send `If-Match: <version>` (a bare number or a quoted number).
- Body may contain `title` and/or `body`; omitted fields are left unchanged.
- If `If-Match` matches the current version: apply the update, increment
  `version` by 1, return `200` with the updated document and a fresh `ETag`.
- If `If-Match` does not match: return `409` with
  `{ "error": "version_conflict", "current_version": <number> }`.
- If `If-Match` is absent: return `428` with `{ "error": "precondition_required" }`.
- If `If-Match` is present but not a valid version number: return `400`.
- Unknown id → `404`.

`DELETE /docs/:id` — delete a document, guarded by `If-Match` with the same
rules as `PUT` (missing → `428`, mismatch → `409`). On success return `204`.

## Notes

- Concurrent updates that present the same version must not both succeed. Exactly
  one wins; the other receives `409`. The stored version must increment by
  exactly one per successful write and must never be reused.
- Return JSON for every response except the `204` delete.

## Summary

Build a SQLite-backed document store with If-Match optimistic concurrency.

## Constraints

- The service must listen on the port provided by PORT.
- Persist documents in SQLite at DATABASE_PATH, defaulting to ./data/app.db.
- Data must survive a process restart.
- Return JSON for every response except the 204 delete.

## Allowed assumptions

- The process starts from the task root.
- bun:sqlite is available; no external database server is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not store state only in memory.
