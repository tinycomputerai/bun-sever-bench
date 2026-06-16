# Role-Based Access Control for a Document Store

Build a Bun HTTP service that manages documents with role-based access control,
per-resource ownership, and an admin override. Storage is in memory.

## Authentication

Every request authenticates with a bearer token in the `Authorization` header:
`Authorization: Bearer <token>`. The valid tokens, their users, and roles are
fixed:

| token        | user      | role   |
| ------------ | --------- | ------ |
| `tok-admin`  | `admin`   | admin  |
| `tok-editor` | `editor`  | editor |
| `tok-editor2`| `editor2` | editor |
| `tok-viewer` | `viewer`  | viewer |

- If the `Authorization` header is missing, malformed, or names an unknown
  token, respond `401` with `{ "error": "unauthorized" }`.
- If the request is authenticated but the role/ownership rules below forbid the
  action, respond `403` with `{ "error": "forbidden" }`.

## Documents

A document has a string `id`, a string `owner` (the user who created it), a
string `title`, and a string `body`. The `owner` is the authenticated user from
the creating request.

## Endpoints

`POST /documents` — create a document.

- Request body: `{ "title": string, "body": string }`.
- Allowed for roles `admin` and `editor`. Role `viewer` → `403`.
- On success respond `201` with `{ "id", "owner", "title", "body" }`.

`GET /documents/:id` — read a document.

- Allowed for any authenticated role (`admin`, `editor`, `viewer`).
- On success respond `200` with `{ "id", "owner", "title", "body" }`.
- Unknown id → `404`.

`PUT /documents/:id` — update a document.

- Request body may contain `title` and/or `body`; omitted fields are unchanged.
- Role `admin` may update any document.
- Role `editor` may update ONLY documents they own; updating a document owned by
  another user → `403`.
- Role `viewer` → `403`.
- On success respond `200` with the updated `{ "id", "owner", "title", "body" }`.
- Unknown id → `404`.

`DELETE /documents/:id` — delete a document.

- Allowed for role `admin` only. Roles `editor` and `viewer` → `403`.
- On success respond `204` with no body.
- Unknown id → `404`.

## Notes

- The `401` (not authenticated) and `403` (authenticated but not permitted)
  distinction must be exact. An unknown or missing token is always `401`, never
  `403`.
- Return JSON for every response except the `204` delete.

## Summary

Build a document store guarded by role-based access control with ownership and an admin override.

## Constraints

- The service must listen on the port provided by PORT.
- Authenticate every request with an Authorization Bearer token.
- Keep documents in memory for the process lifetime.
- Return JSON for every response except the 204 delete.

## Allowed assumptions

- The process starts from the task root.
- The set of valid tokens, users, and roles is fixed and given in the prompt.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not grant access without checking the role and ownership rules.
