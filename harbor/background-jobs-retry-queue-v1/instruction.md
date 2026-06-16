# Asynchronous Job Queue with Retries and Dead-Lettering

Build a Bun HTTP service that runs an in-process asynchronous job queue. Jobs are
submitted over HTTP, processed by a background worker (NOT inside the request),
retried with backoff on failure, and moved to a dead-letter state once they
exhaust their attempts.

## Requirements

- Listen on the port provided by `PORT`.
- State is kept in memory (no database, no external services).
- Every job has: an `id` (string), a `type` (string), a `status`, an integer
  `attempts` (number of times processing has been attempted, starting at 0), and
  an integer `max_attempts` equal to `3`. A job may also carry a `last_error`
  string once a processing attempt has failed.
- `status` is one of: `"queued"`, `"running"`, `"retrying"`, `"succeeded"`,
  `"dead_letter"`. The terminal states are `"succeeded"` and `"dead_letter"`.

### Job processing

A background worker picks up queued jobs and processes them **asynchronously**.
A job MUST NOT be processed synchronously inside the `POST /jobs` request handler;
immediately after creation a job is `"queued"` (or possibly `"running"`), never
already terminal.

Processing of a job is deterministic and decided by its `type`:

- `"ok"` — succeeds on its first attempt.
- `"fail"` — always fails, on every attempt.
- `"flaky"` — fails on attempts 1 and 2, succeeds on attempt 3. (You must track
  the per-job attempt count so this is deterministic.)

For any other `type`, treat the job as always failing (same as `"fail"`).

### Retry policy

- A processing attempt increments `attempts` by 1.
- On success the job becomes `"succeeded"` (terminal).
- On failure, record `last_error`. If `attempts` is still below `max_attempts`,
  schedule a retry after a short backoff (on the order of 20–60 ms; it may grow
  per attempt) and set the status to `"retrying"` until the worker picks it up
  again (at which point it is `"running"`).
- After `max_attempts` (3) failed attempts the job becomes `"dead_letter"`
  (terminal). `attempts` MUST NOT exceed `max_attempts`, and a terminal job MUST
  never be processed again — its status and attempts must stay fixed.

Keep backoffs small so jobs reach a terminal state quickly.

### Endpoints

`POST /jobs` — submit a job.

- Request body: `{ "type": string, "payload"?: object }`.
- Response `201` with `{ "id", "status": "queued", "attempts": 0, "max_attempts": 3 }`.
- Invalid JSON → `400`. Missing/non-string `type` → `422`.

`GET /jobs/:id` — read a job's current state.

- Response `200` with
  `{ "id", "type", "status", "attempts", "max_attempts", "last_error"? }`.
  Include `last_error` only once a failure has occurred.
- Unknown id → `404`.

## Notes

- Return JSON for every response.
- Clients will create a job, then poll `GET /jobs/:id` until it reaches a terminal
  status. Make sure terminal states are reached reliably and stick.

## Summary

Build an in-memory async job queue with bounded retries, backoff, and dead-lettering.

## Constraints

- The service must listen on the port provided by PORT.
- State is kept in memory; no database or external services.
- Jobs must be processed asynchronously by a background worker, not inside the request.
- Return JSON for every response.

## Allowed assumptions

- The process starts from the task root.
- Job processing outcomes are deterministic by job type for testing.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not process jobs synchronously inside the POST handler.
