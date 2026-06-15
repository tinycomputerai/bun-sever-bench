# Local Task Runner

Phase 3 local runner for executing one task package end-to-end and writing result artifacts under `runs/`.

## Commands

Run a task in starter mode:

```sh
bun run run:task tasks/http-apis.todo-health.v1
```

Run a task using the reference solution:

```sh
bun run run:task tasks/http-apis.todo-health.v1 --reference
# or
bun run run:reference tasks/http-apis.todo-health.v1
```

Validate all tasks:

```sh
bun run validate
```

## Lifecycle

1. Validate the task with `validators/validate-task.ts`.
2. Create `runs/<timestamp>-<task-id>/`.
3. Materialize an isolated workspace under `runs/.../workspace/`.
4. Install dependencies with `dependencies.install_command`.
5. Start the app with `interfaces.process.start_command`.
6. Wait for HTTP readiness from `interfaces.process.readiness`.
7. Run public tests from the workspace.
8. Run hidden tests from the original task package (hidden tests are not copied into the workspace).
9. Capture stdout/stderr logs for each phase.
10. Enforce declared timeouts.
11. Stop the started app process.
12. Write `result.json`.

## Workspace Layout

Starter mode copies:

- `task.yaml`
- `prompt.md`
- `package.json`
- lockfile (`bun.lock` or `bun.lockb`) when present
- `src/`
- `fixtures/public/` when present, otherwise non-empty `fixtures/`
- `tests/public/`
- `tests/helpers/` (required by public tests)

Reference mode copies the same metadata and test files, but replaces the submitted solution with `solutions/reference/`.

## Output Layout

```
runs/<timestamp>-<task-id>/
  result.json
  workspace/
  logs/
    install.stdout.log
    install.stderr.log
    start.stdout.log
    start.stderr.log
    public-tests.stdout.log
    public-tests.stderr.log
    hidden-tests.stdout.log
    hidden-tests.stderr.log
```

## Scoring (v0)

| Outcome | Score |
| --- | --- |
| Invalid task | 0 |
| Install failure | 0 |
| Start/readiness failure | 0 |
| Public tests fail | 0 |
| Public pass, hidden fail | 25 |
| Public and hidden pass | 100 |

## Status Values

- `completed`
- `failed_install`
- `failed_start`
- `failed_readiness`
- `failed_public_tests`
- `failed_hidden_tests`
- `timed_out`
- `invalid_task`

## Implementation Notes

- Runner code lives in `runners/local/`.
- Hidden tests run from the original task directory with `BUN_BENCH_APP_DIR` pointing at the workspace.
- Public tests run inside the workspace so hidden test files stay out of the agent-visible tree.
- This runner is local-only: no Docker, no Harbor adapter, no rollout capture.

## Known Limitations

- Only HTTP readiness checks are supported (`interfaces.process.readiness.type: http`).
- Metamorphic tests are not executed yet.
- Scoring v0 is gate-based; weighted component scoring from `task.yaml` is not applied.
- Sandbox/network isolation from the task spec is not enforced locally.
- Full artifact capture (`junit.xml`, `metrics.json`, rollout files) is not implemented yet.
- The runner starts the app for readiness, but task test helpers start their own process instances for assertions.
