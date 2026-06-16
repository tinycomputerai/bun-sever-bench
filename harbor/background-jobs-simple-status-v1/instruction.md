# Simple Background Job Status

Implement a Bun HTTP API for simple in-memory jobs.

## Requirements

- Listen on the port provided by `PORT`.
- `POST /jobs` creates a job and may complete it immediately.
- The first created job must have id `job_1`, then `job_2`, and so on.
- A created job returns HTTP 202:

```json
{ "id": "job_1", "status": "completed" }
```

- `GET /jobs/:id` returns the same job object for existing ids.
- Unknown job ids return HTTP 404 with `{ "error": "not_found" }`.

## Summary

Implement POST /jobs and GET /jobs/:id for completed jobs.

## Constraints

- The service must listen on the port provided by PORT.
- POST /jobs creates a completed in-memory job.
- GET /jobs/:id returns the job status.
- Unknown job ids return HTTP 404 with JSON.

## Allowed assumptions

- The process starts from the task root.
- Jobs may complete immediately.
- State only needs to live in memory for the process lifetime.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
