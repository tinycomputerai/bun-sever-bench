# Creating Tasks

This guide covers Phase 1 task authoring for `bun-bench`.

The canonical task contract is defined in `docs/task-spec.md`. New tasks must validate against `schemas/task.schema.json` and the structural checks in `validators/validate-task.ts`.

## Directory Layout

Create one directory per task under `tasks/`. The directory name must match `task.yaml` `id`.

```text
tasks/{task_id}/
  task.yaml
  prompt.md
  package.json
  bun.lock or bun.lockb
  src/
    README.md
  tests/
    public/
    hidden/
    metamorphic/
    helpers/
  fixtures/
  runner/
  validators/
  solutions/
    reference/
```

Phase 1 accepts either `bun.lock` or `bun.lockb`. The task contract names `bun.lockb`, but Bun 1.3 writes `bun.lock` and deletes empty no-dependency lockfiles unless `bun install --no-save` is used.

## Required Files

- `task.yaml`: task metadata, scoring contract, test declarations, and provenance.
- `prompt.md`: the instruction shown to the agent.
- `package.json`: the task package manifest.
- `src/README.md`: starter implementation notes.
- `tests/public`: public tests that explain basic expectations.
- `tests/hidden`: hidden tests for scored behavior.
- `solutions/reference`: private reference implementation.

## Authoring Rules

- Keep the prompt precise enough that hidden tests verify the written contract.
- Public tests should be useful but incomplete.
- Hidden tests should cover edge cases and simple benchmark-gaming attempts.
- Every task must include `dataset`, `curriculum`, `rollout_capture`, and `benchmarking` metadata.
- `dataset.split` must be one of `train`, `dev`, `public_eval`, or `private_eval`.
- `dataset.leakage_group` must identify the task family for split hygiene.
- `dataset.trainable` must be false for `private_eval` tasks.
- `curriculum.skill_atoms` should name concrete reusable capabilities.
- `curriculum.small_model_suitability` must be `low`, `medium`, or `high`.
- `rollout_capture.enabled` must declare whether rollout artifacts should be collected.
- `benchmarking.agent_metrics` and `benchmarking.app_metrics` must list the expected metric names.
- Do not put subjective style expectations in `success_criteria`.
- Keep `tests.*.weight` values summing to `1.0`.
- Keep `scoring.weights` summing to `1.0`.
- Use relative paths for referenced files and directories.
- Do not reference files outside the task directory.

## Required Metadata

Use this v0 shape for task training and evaluation metadata:

```yaml
dataset:
  split: dev
  leakage_group: http-apis.todo-health
  trainable: true
curriculum:
  skill_atoms:
    - bun-http-server
    - json-response
  small_model_suitability: high
rollout_capture:
  enabled: true
benchmarking:
  agent_metrics:
    - wall_time_ms
    - input_tokens
    - output_tokens
    - tool_calls
  app_metrics:
    - readiness_ms
    - p95_latency_ms
    - max_rss_mb
```

Do not use `private_eval` with `trainable: true`.

## Example

See `tasks/http-apis.todo-health.v1` for the first complete Phase 1 task. It defines a Level 1 Bun HTTP task where `GET /health` must return:

```json
{ "ok": true }
```

The starter implementation is intentionally incomplete. The reference solution can be tested with:

```sh
cd tasks/http-apis.todo-health.v1
bun run test:reference
```

## Validation

Validate one task:

```sh
bun run validate:task tasks/http-apis.todo-health.v1
```

Validate every task:

```sh
bun run validate
```

Phase 1 validation is structural. It does not execute reference solutions, enforce Harbor packaging, score submissions, or generate datasets yet.
