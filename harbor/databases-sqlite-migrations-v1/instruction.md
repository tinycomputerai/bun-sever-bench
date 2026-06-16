# Idempotent Schema Migrations on Boot

Build a Bun HTTP service that evolves its SQLite schema through an ordered list
of migrations applied exactly once on startup, tracked in a version table, and
exposes the resulting users API.

## Requirements

- Listen on the port provided by `PORT`.
- Persist all state in a SQLite database. Use the file path from `DATABASE_PATH`
  when it is set; otherwise default to `./data/app.db`. Data MUST survive a
  process restart.

### Migrations

On startup the app MUST apply the following fixed, ordered list of migrations,
each exactly once over the lifetime of the database, tracked in a
`schema_migrations` table:

1. `create_users` — create a `users` table with an integer primary key `id` and
   a `name` column.
2. `add_users_email` — `ALTER TABLE users ADD COLUMN email` (add an `email`
   column to `users`).
3. `index_users_email` — create an index on `users(email)`.

A migration that has already been recorded as applied MUST NOT run again.
Restarting the process MUST NOT re-apply any migration and MUST NOT error — in
particular the `ALTER TABLE` must run only on the first boot, never on a later
one. Migrations are applied in the listed order, and each is recorded by its
name/id in `schema_migrations` once it succeeds.

### Endpoints

`GET /schema/version` — report migration status.

- Response `200` with `{ "version": integer, "applied": [string, ...] }` where
  `version` is the count of applied migrations and `applied` is the list of
  applied migration ids/names in the order they were applied. After a normal
  boot this is `{ "version": 3, "applied": ["create_users", "add_users_email", "index_users_email"] }`.

`POST /users` — create a user.

- Request body: `{ "name": string, "email": string }`.
- Response `201` with `{ "id", "name", "email" }`.
- Invalid JSON → `400`. Missing/non-string `name` or `email` → `422`.

`GET /users/:id` — read a user.

- Response `200` with `{ "id", "name", "email" }`.
- Unknown id → `404`.

## Notes

- Return JSON for every response.
- Validate the request body shape before using any value. Do not expose stack
  traces.

## Summary

Build a SQLite service that applies ordered migrations once, tracked in a version table.

## Constraints

- The service must listen on the port provided by PORT.
- Persist data in SQLite at DATABASE_PATH, defaulting to ./data/app.db.
- Data and schema version must survive a process restart.
- Apply each migration exactly once; never re-run a recorded migration.

## Allowed assumptions

- The process starts from the task root.
- bun:sqlite is available; no external database server is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not store state only in memory.
