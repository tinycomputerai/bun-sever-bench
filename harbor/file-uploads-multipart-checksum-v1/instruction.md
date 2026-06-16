# Secure Multipart Upload with Integrity Checksum

Build a Bun HTTP service that accepts file uploads via `multipart/form-data`,
enforces size and content-type limits, sanitizes filenames against path
traversal, and computes an integrity checksum. Store uploads in memory.

## Requirements

- Listen on the port provided by `PORT`.
- Keep uploaded files in memory (no disk writes are required).

### Endpoints

`POST /uploads` — accept a `multipart/form-data` request.

- Parse the request with the web `FormData` API (`await request.formData()`).
  The upload is sent in a form field named `file`; its value is a `File`/`Blob`
  with `.name`, `.type`, `.size`, and `.arrayBuffer()`.
- If there is no `file` field (or it is not a file/blob value) → `400`
  `{ "error": "missing_file" }`.
- Size limit: `1 MiB` = `1048576` bytes. A file larger than that →
  `413` `{ "error": "too_large" }`.
- Allowed content types: `image/png`, `image/jpeg`, `text/plain`. Compare only
  the MIME essence (the part before any `;` parameters such as `charset`),
  case-insensitively. Any other type → `415` `{ "error": "unsupported_type" }`.
  Report the bare essence type in the `content_type` response field.
- Filename sanitization: store only the basename. Strip every directory
  component and any path-traversal segments so the stored filename can never
  contain a `/`, `\`, or `..`. For example `"../../etc/passwd"` is stored as
  `"passwd"` and `"/abs/x.png"` is stored as `"x.png"`.
- Compute the lowercase hex SHA-256 of the raw file bytes.
- Optional integrity check: if the request includes an `X-Expected-Sha256`
  header and its value does not equal the computed digest →
  `422` `{ "error": "checksum_mismatch" }`. In that case the file MUST NOT be
  stored. The comparison is case-insensitive on the hex digest.
- On success, store the upload and return `201` with
  `{ "id", "filename", "size", "sha256", "content_type" }` where `filename` is
  the sanitized basename, `size` is the byte length, `sha256` is the lowercase
  hex digest, and `content_type` is the file's content type.

`GET /uploads/:id/checksum` — return the stored checksum.

- If an upload with that `id` exists → `200` `{ "sha256": <lowercase hex> }`.
- Unknown id → `404`.

## Notes

- Do not set the request `Content-Type` yourself when describing multipart
  bodies; the standard behavior is for the client to set the multipart boundary.
- Return JSON for every response.
- Evaluate the checks in an order that yields the documented status for each
  failure (missing file, oversize, unsupported type, checksum mismatch).

## Summary

Build a multipart upload service with size/type limits, safe filenames, and sha256 integrity.

## Constraints

- The service must listen on the port provided by PORT.
- Parse uploads with the FormData web API from the multipart body.
- Enforce a 1 MiB size limit and an image/png, image/jpeg, text/plain allowlist.
- Store the sanitized basename only; never keep directory or traversal segments.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- Clients let fetch set the multipart boundary; do not require a manual content-type.
- Uploads may be kept in memory; durable storage is not required.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not trust the client-supplied filename without sanitization.
