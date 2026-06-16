# Text Upload Byte Counter

Implement a Bun HTTP service that counts uploaded text bytes.

## Requirements

- Listen on the port provided by `PORT`.
- `POST /upload` accepts only `text/plain` request bodies.
- A valid request returns HTTP 200 with:

```json
{ "bytes": 5 }
```

- Count UTF-8 bytes, not JavaScript string characters.
- Missing or non-text content types return HTTP 415 with:

```json
{ "error": "unsupported_media_type" }
```

## Summary

Implement POST /upload for text/plain byte counting.

## Constraints

- The service must listen on the port provided by PORT.
- POST /upload accepts only text/plain bodies.
- Successful responses return the uploaded byte count.
- Unsupported media types return HTTP 415 with JSON.

## Allowed assumptions

- The process starts from the task root.
- No files need to be written to disk.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
