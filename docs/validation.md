# Validation

`bun-bench` Phase 1 validation checks whether task packages are structurally valid and ready for runner work.

## Commands

Validate all tasks:

```sh
bun run validate
```

Validate all tasks explicitly:

```sh
bun run validate:tasks
```

Validate one task:

```sh
bun run validate:task <task-dir>
```

Example:

```sh
bun run validate:task tasks/http-apis.todo-health.v1
```

## What Is Checked

The validator currently checks:

- `task.yaml` parses as YAML.
- `task.yaml` matches `schemas/task.schema.json`.
- Unknown top-level fields fail unless they start with `x_`.
- The task directory name matches `task.yaml` `id`.
- Required package layout entries exist.
- `instruction.prompt_file` exists.
- Test files referenced by `tests.public`, `tests.hidden`, `tests.metamorphic`, or `tests.generated` exist.
- `reference_solution.path` exists.
- Test suite weights sum to `1.0`.
- Scoring component weights sum to `1.0`.
- `tags` includes the primary `category`.
- Generated tasks include generator provenance metadata.
- `dataset.split` exists and is one of `train`, `dev`, `public_eval`, or `private_eval`.
- `dataset.leakage_group` exists.
- `dataset.trainable` exists.
- `private_eval` tasks have `trainable: false`.
- `curriculum.skill_atoms` exists.
- `curriculum.small_model_suitability` exists.
- `rollout_capture.enabled` exists.
- `benchmarking.agent_metrics` and `benchmarking.app_metrics` exist.

## What Is Not Checked Yet

Phase 1 does not yet:

- run public or hidden tests against an agent submission
- run the reference solution automatically
- compute scores
- enforce sandbox isolation
- package tasks for Harbor
- generate synthetic tasks
- check for dataset leakage
- verify that declared benchmarking metrics are actually collected
- emit rollout artifacts

Those belong to later phases.

## Lockfile Compatibility

The task contract's package layout names `bun.lockb`. Current Bun releases write `bun.lock` for text lockfiles and may delete empty lockfiles for no-dependency packages.

For Phase 1, the validator accepts either:

- `bun.lock`
- `bun.lockb`

No-dependency example tasks should use `bun install --no-save` as their install command to avoid lockfile churn.

## Exit Codes

- `0`: validation passed.
- `1`: one or more tasks are invalid.
- `2`: CLI usage error.

Validation errors are printed with field or path context so authors can fix the task package directly.
