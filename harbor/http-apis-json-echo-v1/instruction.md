# JSON Echo Endpoint

Implement a Bun HTTP service with one JSON echo endpoint.

## Requirements

- Listen on the port provided by `PORT`.
- `POST /echo` must parse the JSON request body and return it unchanged.
- Valid JSON responses must use HTTP 200.
- Malformed JSON must return HTTP 400 with:

```json
{ "error": "invalid_json" }
```

- Unsupported paths or methods must return HTTP 404 with a JSON body.

## Commands

- Start the service with `bun run start`.
- Run the public tests with `bun test tests/public`.

## Summary

Implement POST /echo for JSON payloads.

## Constraints

- The service must listen on the port provided by PORT.
- POST /echo must return the parsed JSON request body unchanged.
- Invalid JSON must return HTTP 400 with a JSON error body.
- Unsupported paths or methods must return HTTP 404 with a JSON body.

## Allowed assumptions

- The process starts from the task root.
- No persistence is required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
