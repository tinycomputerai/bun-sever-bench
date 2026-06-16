# Harbor Integration

Status: Phase 6. **Harbor is the primary execution engine for bun-bench.**

The local/agent/suite runners (`run:task`, `run:agent`, `run:suite`) remain only
as development smoke tests. New execution features (agent execution, suite
orchestration, rollout capture) are **not** built here — Harbor provides them.
bun-bench's job is to (1) author tasks and (2) export them into Harbor-compatible
packages. This document covers the export adapter.

## Commands

```sh
# Export one task
bun run harbor:export --task tasks/databases.optimistic-version.v1

# Export many tasks (same glob semantics as run:suite)
bun run harbor:export-suite --tasks 'tasks/**'
```

Both write packages under `harbor/<sanitized-id>/` (override with `--out <dir>`).
`harbor/` is a **committed** directory: the packages are versioned, diffable in
PRs, and publishable. They are generated from `tasks/` — `tasks/` remains the
authored source of truth — so regenerate after editing a task rather than hand-
editing a package. Harbor *run outputs* (under `jobs/`) are gitignored.

Run an exported task with Harbor (see "Running a task" below):

```sh
harbor run -p harbor/<sanitized-id> --agent oracle -e docker -y
```

## Exported Harbor task layout

The adapter emits the canonical Harbor (Terminal-Bench-lineage) package:

```
harbor/<sanitized-id>/
  task.toml                 # Harbor task metadata (schema_version 1.3)
  instruction.md            # Agent-facing prompt (identical to the bun-bench prompt)
  README.md                 # Human summary; preserves the true bun-bench id
  bun-bench.meta.json       # Sidecar: full bun-bench provenance + scoring model
  .gitignore
  environment/
    Dockerfile              # FROM oven/bun:1; bakes the agent-visible workspace
    app/                    # Starter workspace -> copied to /app (agent edits here)
      package.json
      bun.lock
      src/...               # starter implementation (stub)
      tests/public/...      # public tests (agent-visible, orientation)
      tests/helpers/...     # test server helper
  tests/                    # Runner-only assets, injected at /tests during verify
    test.sh                 # Verifier: runs public + hidden, writes reward.txt
    public/...              # authoritative copy of public tests
    hidden/...              # hidden tests (never in the agent image)
    helpers/...             # test server helper
  solution/
    solve.sh                # Oracle: writes the reference solution into /app
```

### Why this split

- **`environment/app/`** is baked into the Docker image and becomes `/app`, the
  working directory the agent edits. It contains the starter, the manifest, the
  lockfile, the public tests, and the helper — i.e. exactly what a bun-bench
  agent sees in the local runner's materialized workspace. It deliberately
  **excludes** `task.yaml` (which carries `known_failure_modes` and scoring) and
  the hidden tests.
- **`tests/`** is injected by Harbor at verification time as `/tests` and is not
  part of the agent image. `tests/hidden` therefore satisfies the
  "hidden tests as runner-only assets" requirement. `tests/public` is duplicated
  here so the verifier runs an authoritative, un-tamperable copy.
- **`solution/solve.sh`** is run by the `oracle` agent to reproduce a passing
  solution; it embeds the bun-bench reference `src/` via heredocs so it is fully
  self-contained.

### Verifier (`tests/test.sh`) and reward

`test.sh` runs from `/tests` against the agent's solution at `/app`
(`BUN_BENCH_APP_DIR=/app`), mirroring the bun-bench local lifecycle: both suites
spawn the solution's server through the helper. It writes a float reward to
`/logs/verifier/reward.txt` using the bun-bench gate model:

| Outcome | reward.txt | bun-bench score |
| --- | --- | --- |
| public pass **and** hidden pass | `1.0` | 100 |
| public pass, hidden fail | `0.25` | 25 |
| public fail (or earlier failure) | `0.0` | 0 |

## Mapping: bun-bench `task.yaml` → Harbor

| bun-bench field | Harbor destination | Notes |
| --- | --- | --- |
| `id` | `task.name` = `bun-bench/<sanitized-id>`; `task.keywords` `id:<id>`; `README.md`; `bun-bench.meta.json` | Harbor names are slugs, so dots → hyphens. The true id is preserved verbatim in keywords + sidecar + README. |
| `task_version` | `task.keywords` `task_version:<v>`; `bun-bench.meta.json` | Harbor has its own `schema_version`; bun-bench versions are carried as metadata. |
| `spec_version` | `task.keywords` `spec_version:<v>`; `bun-bench.meta.json` | |
| `title` | `README.md`; `bun-bench.meta.json` | |
| `description` | `task.description` | Whitespace-collapsed. |
| `category` | `task.keywords` `category:<c>`; `metadata.tags[0]`; `bun-bench.meta.json` | `metadata.category` is set to Harbor's `software_engineering`. |
| `tags` | `metadata.tags` (deduped with category) | |
| `difficulty.level` | `metadata.difficulty` (1–2→easy, 3→medium, 4–5→hard); `keywords` `difficulty:<n>`; sidecar | Numeric level preserved in keywords + sidecar. |
| `instruction` (prompt.md + appended constraints/assumptions/disallowed-shortcuts) | `instruction.md` | Produced by the same `constructPrompt()` the local agent runner uses, so the agent sees an identical prompt. |
| `tests.public` files | `environment/app/tests/public` (agent-visible) **and** `tests/public` (verifier) | |
| `tests.hidden` files | `tests/hidden` (runner-only) | Never baked into the agent image. |
| `tests.helpers` | `environment/app/tests/helpers` **and** `tests/helpers` | |
| `timeouts.test_seconds` | `verifier.timeout_sec` = `max(300, test_seconds*2+60)` | Verifier runs both suites sequentially. |
| `timeouts.total_seconds` | `agent.timeout_sec` | |
| `timeouts.install_seconds` | `environment.build_timeout_sec` = `max(600, install_seconds)` | |
| `environment.network` | `environment.network_mode` (`disabled`→`no-network`, else `public`) | Harbor enum is `no-network` / `public` / `allowlist`. |
| `dependencies` (zero-dep, `bun install --no-save`) | implicit | Bun ships in `oven/bun:1`; no install step is emitted. Dependency-having tasks would add `RUN bun install` to the Dockerfile. |
| `scoring` (weights, gates) | `bun-bench.meta.json` + enforced by `tests/test.sh` reward model | The gate scoring is realized as the reward computation, not as Harbor weights. |
| `success_criteria` | `bun-bench.meta.json` | Reference/maintainer metadata. |
| `solutions/reference/src/*` | `solution/solve.sh` (embedded heredocs) | Used by the `oracle` agent. |

## Unsupported / lossy fields

Harbor's `task.toml` schema does not have first-class slots for several bun-bench
fields. These are **preserved out-of-band** in `task.keywords` and
`bun-bench.meta.json` rather than dropped, but Harbor itself does not interpret
them:

- `task_version`, `spec_version` — no native Harbor equivalent (Harbor versions
  packages via its registry). Carried in keywords + sidecar.
- `scoring.weights` and `scoring.gates` — Harbor scores via a single `reward`.
  The bun-bench gate model is collapsed into the `0.0 / 0.25 / 1.0` reward in
  `test.sh`; the original weights live in the sidecar.
- `difficulty.rationale`, `difficulty.expected_*`, `expected_concepts` — sidecar only.
- `curriculum`, `dataset` (split/leakage/trainable), `rollout_capture`,
  `benchmarking`, `provenance`, `known_failure_modes` — not exported into the
  Harbor package. `known_failure_modes` is intentionally withheld from the agent;
  the rest are bun-bench dataset-management concerns Harbor does not model. They
  remain in the source `task.yaml`.
- `interfaces.process.readiness` — Harbor has no separate readiness gate; the
  verifier starts the server itself via the helper, so readiness is implicit.
- Per-`bun-bench` security sandbox flags — superseded by Harbor's environment
  (`network_mode`, container isolation).

The bun-bench `task.yaml` remains the source of truth; the export is a
projection, and `bun-bench.meta.json` lets a downstream consumer recover the
non-Harbor fields.

## Running a task (single, verified)

The `oracle` agent runs `solution/solve.sh` (the reference) with no LLM, so it
verifies the package end-to-end for free:

```sh
bun run harbor:export --task tasks/databases.optimistic-version.v1
harbor run \
  -p harbor/databases-optimistic-version-v1 \
  --agent oracle \
  -e docker \
  -y \
  -o jobs --job-name bunbench-oracle-verify
```

Requirements: Docker running and Harbor ≥ 0.13. Results land in
`jobs/<job-name>/`. To run a real coding agent instead of the oracle, swap
`--agent oracle` for e.g. `--agent claude-code -m <model>` (and grant the agent
phase network with `--allow-agent-host` since the environment is `no-network`).

See `docs/HARBOR-RUN.md` for the recorded verified run of this task.

## Result normalization plan

Harbor emits its own per-trial results under `jobs/<job-name>/`. To keep
continuity with bun-bench's `result.json` schema (and leaderboards), normalize as
follows. This is a **read/derive** step over Harbor output — it adds no execution
infrastructure.

| bun-bench `result.json` field | Source in Harbor output |
| --- | --- |
| `task_id`, `task_version`, `spec_version` | `bun-bench.meta.json` in the package (or parsed from `task.keywords`) |
| `agent_id` | Harbor agent name (`oracle`, `claude-code`, `codex`, …) + model |
| `run_id` | Harbor trial/job id |
| `status` | derived from reward + Harbor trial state: `completed` (reward 1.0), `failed_hidden_tests` (reward 0.25), `failed_public_tests`/`failed_*` (reward 0.0 with phase from `/logs/verifier/*.log`), `timed_out`, `infrastructure_error` |
| `score` | `reward * 100` (1.0→100, 0.25→25, 0.0→0) — matches the local gate scoring |
| `outcome.{install,start,readiness,public_tests,hidden_tests}` | parsed from `/logs/verifier/public.log` and `hidden.log` exit markers |
| `durations.*` | Harbor trial timing fields |
| `metrics` (`input_tokens`, `output_tokens`, `wall_time_ms`, `tool_calls`) | Harbor trajectory/usage records, when the agent reports them |

A small `runners/harbor/normalize.ts` reader can produce `result.json` from a
Harbor `jobs/<job>/` directory when leaderboard parity is needed. It is
intentionally **not** implemented yet: it is a pure post-processing reader (no
new execution engine), to be added only if/when bun-bench leaderboards must
ingest Harbor runs. Until then, Harbor's native results are authoritative and the
reward → score mapping above is the contract.
```
