# In-memory Notes CRUD API

Implement a Bun HTTP API for in-memory notes.

## Requirements

- Listen on the port provided by `PORT`.
- `POST /notes` accepts JSON with a non-empty string `text`.
- A valid create returns HTTP 201:

```json
{ "id": "note_1", "text": "hello" }
```

- `GET /notes` returns:

```json
{ "notes": [{ "id": "note_1", "text": "hello" }] }
```

- Notes must remain in insertion order.
- Missing or blank text returns HTTP 422 with `{ "error": "invalid_text" }`.

## Summary

Implement POST /notes and GET /notes with in-memory state.

## Constraints

- The service must listen on the port provided by PORT.
- POST /notes creates a note with a non-empty text field.
- GET /notes returns all notes in insertion order.
- Invalid note text returns HTTP 422 with JSON.

## Allowed assumptions

- The process starts from the task root.
- Notes only need to persist for the process lifetime.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
