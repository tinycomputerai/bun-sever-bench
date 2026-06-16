# Dataset Export

Phase 6 turns successful agent runs into training artifacts for a tiny
specialized Bun backend model. Export is read-only: it scans existing run
directories and writes JSONL files under `datasets/`.

## Commands

Export supervised fine-tuning (SFT) chat records:

```sh
bun run export:sft --runs 'runs/**' --out datasets/sft/bun-bench.jsonl
```

Export patch-oriented records:

```sh
bun run export:patches --runs 'runs/**' --out datasets/patches/bun-bench.jsonl
```

Both commands accept the same options:

| Flag | Default | Description |
| --- | --- | --- |
| `--runs` | required | Glob or path to run directories containing `result.json` |
| `--out` | required | Output JSONL path |
| `--min-score` | `100` | Minimum score required for export |
| `--allow-private-eval` | off | Include `private_eval` tasks (excluded by default) |
| `--tasks-root` | `tasks` | Task package root for prompts and dataset metadata |

## Input: Run Artifacts

Exports read from the Phase 4 agent run layout documented in `docs/AGENTS.md`:

```
runs/<timestamp>-<task-id>/
  result.json
  workspace/
  logs/
    agent-prompt.md
```

Only **agent** runs with `status: "completed"` are eligible. Reference runs,
local starter runs, and failed agent runs are skipped.

## Export Rules

The exporter enforces dataset hygiene:

- **Score gate:** only runs with `score >= --min-score` (default full credit: 100)
- **Split hygiene:** `private_eval` tasks are excluded unless `--allow-private-eval`
- **Trainability:** tasks with `dataset.trainable: false` are always excluded
- **No hidden tests:** solution patches include only `src/**` and `package.json`
- **No reference solutions:** runs whose workspace matches `solutions/reference` are excluded
- **No oracle runs:** non-agent `result.json` files are ignored

Prompt text comes from `logs/agent-prompt.md` when present, otherwise from the
task's public prompt construction (`prompt.md` plus allowed `task.yaml` metadata).

Solution text is a unified diff from the task starter tree to the run workspace.
Hidden tests, fixtures copied for agent visibility, lockfiles, and prompt files
are never included.

## Output Formats

### SFT (`datasets/sft/*.jsonl`)

Each line is one JSON object:

```json
{
  "messages": [
    { "role": "system", "content": "You are a Bun backend specialist..." },
    { "role": "user", "content": "<task prompt>" },
    { "role": "assistant", "content": "<unified diff patch>" }
  ],
  "metadata": {
    "task_id": "authentication.bearer-profile.v1",
    "run_id": "2026-06-17T12-00-00-000Z-authentication.bearer-profile.v1",
    "score": 100,
    "agent_id": "claude-code",
    "duration_ms": 42000,
    "token_input": 1200,
    "token_output": 800,
    "dataset": {
      "split": "dev",
      "leakage_group": "authentication.bearer-profile"
    }
  }
}
```

### Patches (`datasets/patches/*.jsonl`)

Each line is one JSON object:

```json
{
  "task_id": "authentication.bearer-profile.v1",
  "run_id": "2026-06-17T12-00-00-000Z-authentication.bearer-profile.v1",
  "prompt": "<task prompt>",
  "patch": "<unified diff patch>",
  "files_changed": ["src/server.ts"],
  "score": 100,
  "agent_id": "claude-code",
  "dataset": {
    "split": "dev",
    "leakage_group": "authentication.bearer-profile"
  }
}
```

Both formats include `dataset.split` and `dataset.leakage_group` from each
task's `task.yaml` so downstream training pipelines can enforce split hygiene.

## Typical Workflow

1. Run agents and collect scored artifacts:

   ```sh
   bun run run:suite --agent claude-code --tasks 'tasks/**'
   ```

2. Export training data from perfect runs:

   ```sh
   bun run export:sft --runs 'runs/**' --out datasets/sft/bun-bench.jsonl
   bun run export:patches --runs 'runs/**' --out datasets/patches/bun-bench.jsonl
   ```

3. Inspect the summary printed to stdout (`discovered`, `exported`, skip reasons).

Generated JSONL files are gitignored. Commit task and runner changes; keep
exported datasets local or publish them through your training pipeline.

## Skip Reasons

When a run is not exported, the command reports aggregated skip reasons:

| Reason | Meaning |
| --- | --- |
| `missing_result` | Run directory has no `result.json` |
| `invalid_result` | `result.json` could not be parsed |
| `not_agent_run` | Not an agent run (missing `mode: "agent"`) |
| `not_completed` | Run did not reach `status: "completed"` |
| `below_min_score` | Score below `--min-score` |
| `private_eval_excluded` | Task split is `private_eval` and flag not set |
| `not_trainable` | Task has `dataset.trainable: false` |
| `missing_task` | Task package or dataset metadata not found |
| `missing_prompt` | Prompt could not be loaded |
| `missing_solution` | Workspace missing or identical to starter |
| `reference_solution` | Workspace matches the reference oracle |
| `hidden_tests_in_patch` | Patch would include forbidden paths |

## Implementation

```
runners/export/
  export-sft.ts         # SFT CLI
  export-patches.ts     # patch CLI
  export-dataset.ts     # shared export loop
  prepare-run.ts        # eligibility checks
  solution-patch.ts     # starter→workspace diff
  build-records.ts      # record builders
  discover-runs.ts      # run glob discovery
  task-metadata.ts      # task.yaml dataset fields
  parse-args.ts         # CLI parsing
  constants.ts
  types.ts
```

Model training is out of scope for Phase 6. These exports are the compression
dataset input for a later fine-tuning stage.
