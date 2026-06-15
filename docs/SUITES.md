# Benchmark Suite Execution

Phase 4.5 suite runner for executing a coding agent across multiple bun-bench tasks and producing aggregate results.

## Command

```sh
bun run run:suite \
  --agent claude-code \
  --tasks 'tasks/**'
```

Run a single task by path:

```sh
bun run run:suite \
  --agent claude-code \
  --tasks tasks/http-apis.todo-health.v1
```

## Lifecycle

1. Discover task directories matching the `--tasks` pattern.
2. Validate each discovered task with `validators/validate-task.ts`.
3. Run tasks sequentially via the existing `run:agent` implementation.
4. Write aggregate artifacts under `results/<agent-id>/`.

Each task still produces its own run artifact under `runs/<timestamp>-<task-id>/result.json`.

## Task Discovery

The `--tasks` pattern supports:

| Pattern | Behavior |
| --- | --- |
| `tasks/**` | All task directories under `tasks/` containing `task.yaml` |
| `tasks/*` | Same as `tasks/**` |
| `tasks/http-apis.todo-health.v1` | One specific task |

Only structurally valid tasks are included. Invalid directories are skipped silently during discovery.

## Output Layout

```
results/<agent-id>/
  summary.json
  leaderboard.json
```

### summary.json

```json
{
  "agent_id": "claude-code",
  "total_tasks": 10,
  "passed": 8,
  "failed": 2,
  "average_score": 85.0,
  "total_wall_time_ms": 350000,
  "started_at": "2026-06-16T00:00:00.000Z",
  "completed_at": "2026-06-16T00:05:50.000Z"
}
```

| Field | Description |
| --- | --- |
| `total_tasks` | Number of valid tasks executed |
| `passed` | Tasks with `status: "completed"` |
| `failed` | Tasks with any other status |
| `average_score` | Mean score across all tasks |
| `total_wall_time_ms` | Actual elapsed time for the full suite run |

### leaderboard.json

```json
{
  "agent_id": "claude-code",
  "entries": [
    {
      "task_id": "http-apis.todo-health.v1",
      "score": 100,
      "duration_ms": 35277,
      "status": "completed",
      "run_id": "2026-06-15T22-34-32-113Z-http-apis.todo-health.v1"
    }
  ]
}
```

Entries are sorted by score descending, then task id ascending.

| Field | Description |
| --- | --- |
| `task_id` | Task identifier |
| `score` | Task score from the agent run |
| `duration_ms` | Per-task wall time from `result.json` |
| `status` | Final task status |
| `run_id` | Run directory name under `runs/` |

## Pass / Fail Semantics

A task **passes** when its agent run status is `completed` (public and hidden tests both pass).

A task **fails** for any other status, including:

- `failed_agent`
- `failed_install`
- `failed_start`
- `failed_readiness`
- `failed_public_tests`
- `failed_hidden_tests`
- `timed_out`
- `invalid_task`

## Implementation Layout

```
runners/suite/
  run-suite.ts       # CLI entry point
  suite.ts           # Sequential orchestration
  discover-tasks.ts  # Task pattern resolution and validation
  types.ts           # summary.json and leaderboard.json types
```

The suite runner reuses `runAgent()` from `runners/agent/runner.ts` without duplicating agent or validation logic.

## Known Limitations

- Tasks run sequentially, not in parallel.
- Suite output overwrites previous results for the same agent id.
- No Harbor integration, rollout capture, or RL.
- Task discovery supports simple glob patterns only (`tasks/**`, `tasks/*`, or a single task path).
