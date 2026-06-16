# HTTP Request Metrics with Bounded Label Cardinality

Build a Bun HTTP service that instruments every request it handles and exposes
Prometheus-style metrics, while propagating a request id on every response.

## Requirements

- Listen on the port provided by `PORT`. State is kept in memory; no persistence
  is required.

### Request id propagation

- Every response (including `/metrics` and `404`s) MUST include an
  `X-Request-Id` header.
- If the incoming request has an `X-Request-Id` header whose value is present and
  non-empty (after trimming), echo that exact value back.
- Otherwise generate a fresh id (e.g. `crypto.randomUUID()`).

### Metrics recording

For every request the server handles EXCEPT calls to `GET /metrics`, record:

- A request counter keyed by the tuple `(method, route_template, status)`.
- A request-duration observation: increment a global observation count by 1 and
  add the handler's elapsed time in milliseconds to a global sum.

`GET /metrics` itself MUST NOT be recorded in either the counter or the duration
metrics.

#### Route templating (cardinality control)

Counters MUST be keyed by a route **template**, never the raw path, so that
high-cardinality path segments do not explode the label space.

- A request that matches a parameterized route is recorded under its template.
  `GET /items/123` and `GET /items/456` are BOTH recorded with
  `route="/items/:id"` (a single series, not two).
- A request to a path that matches no known route is recorded with
  `route="<unmatched>"`.

### Demo endpoints

- `GET /items/:id` → `200` with JSON `{ "id": <id> }`. The `id` is the raw path
  segment (a string or number is acceptable).
- `GET /work` → `200` with JSON `{ "ok": true }`.
- `GET /work?fail=1` → `500` with JSON `{ "error": "boom" }`.
- Any unmatched route (any method/path not listed above and not `/metrics`) →
  `404` with JSON `{ "error": "not_found" }`, recorded under `route="<unmatched>"`.

### Metrics endpoint

`GET /metrics` → `200`, header `content-type: text/plain`, body is Prometheus
exposition text. Emit at least the following lines (exact format; tests parse
this text):

- One counter line per observed `(method, route, status)` label set:

  ```
  http_requests_total{method="GET",route="/items/:id",status="200"} 2
  ```

  The label order MUST be `method`, then `route`, then `status`. Label values are
  double-quoted. There is exactly one space between the closing `}` and the
  numeric value. Each line ends with a newline.

- Two global duration lines:

  ```
  http_request_duration_ms_count 7
  http_request_duration_ms_sum 12.5
  ```

  `http_request_duration_ms_count` is the integer number of recorded
  observations. `http_request_duration_ms_sum` is the total milliseconds (an
  integer or decimal). Both appear on their own line with a single space before
  the value.

`/metrics` is never reflected in `http_requests_total`, and never increments the
duration metrics.

## Readiness

`GET /metrics` returns `200`.

## Summary

Build an HTTP service with route-templated request metrics and X-Request-Id propagation.

## Constraints

- The service must listen on the port provided by PORT.
- Metrics state is kept in memory; no persistence is required.
- Counters must be keyed by route template, never the raw path.
- GET /metrics must not be recorded in any metric.

## Allowed assumptions

- The process starts from the task root.
- crypto.randomUUID is available for generating request ids.

## Disallowed shortcuts

- Do not hard-code behavior based on test values.
- Do not read files under tests/hidden.
- Do not modify test files or runner files.
- Do not label counters by raw path segments.
