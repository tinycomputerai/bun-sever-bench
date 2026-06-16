# Required User Name Validation

Implement a Bun HTTP service that creates a user only when a valid name is provided.

## Requirements

- Listen on the port provided by `PORT`.
- `POST /users` accepts JSON with a non-empty string `name`.
- A valid request returns HTTP 201 with:

```json
{ "id": "user_1", "name": "Ada" }
```

- Missing, null, non-string, or blank `name` values return HTTP 422 with:

```json
{ "error": "invalid_name" }
```

- Unsupported paths or methods must return HTTP 404 with a JSON body.

## Summary

Implement POST /users with required name validation.

## Constraints

- The service must listen on the port provided by PORT.
- POST /users must accept JSON with a non-empty string name.
- Valid users return HTTP 201 with id and name.
- Invalid names return HTTP 422 with a JSON error.

## Allowed assumptions

- The process starts from the task root.
- Persistence across requests is not required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
