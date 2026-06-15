# bun-bench Task Specification Contract

Status: draft
Spec version: 0.1.0
Audience: task authors, generator authors, validator authors, runner authors, Harbor adapter maintainers

## 1. Purpose

This document defines the canonical task contract for `bun-bench`.

`bun-bench` tasks evaluate whether a coding agent can build production-quality backend systems using Bun. A valid task must be:

- reproducible in an isolated execution environment
- testable without human judgment
- scored primarily by behavioral correctness
- resistant to benchmark gaming and memorization
- exportable to Harbor without losing task metadata or scoring semantics
- suitable for synthetic dataset generation without duplicate or near-duplicate task leakage

This contract is intentionally stricter than a prompt format. It defines the data model, file layout, lifecycle, validation requirements, scoring hooks, generation provenance, and Harbor handoff boundaries.

## 2. Non-Goals

This contract does not define:

- the complete repository architecture
- the full Harbor API
- UI or leaderboard presentation
- model training policy
- one fixed backend framework for every task

Tasks may use Elysia, Hono, native Bun APIs, or other explicitly allowed libraries. The task must define what is allowed.

## 3. Normative Language

The terms `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, and `MAY` are normative.

- `MUST`: required for task validity
- `MUST NOT`: prohibited
- `SHOULD`: expected unless a documented exception exists
- `MAY`: optional behavior

## 4. Task Identity

Every task MUST have a stable identity:

```yaml
id: http-apis.todo-pagination.v1
spec_version: 0.1.0
task_version: 1.0.0
```

### 4.1 `id`

`id` is the stable logical identifier of a task family.

Rules:

- MUST be globally unique within the benchmark
- MUST use lowercase ASCII letters, digits, dots, and hyphens only
- MUST NOT contain spaces, underscores, slashes, or file extensions
- SHOULD follow `{category}.{short-name}.v{major}` for authored tasks
- SHOULD follow `{category}.{template}.{variant-hash}.v{major}` for generated tasks

The `id` MUST NOT change when tests are strengthened in a compatible way. The major suffix MUST change when the user-facing instruction, expected behavior, or scoring target changes incompatibly.

### 4.2 `spec_version`

`spec_version` identifies the version of this task contract.

Rules:

- MUST be SemVer
- MUST be accepted by the validator before execution
- MUST be recorded in every result artifact

### 4.3 `task_version`

`task_version` identifies a specific revision of the task.

Rules:

- MUST be SemVer
- Patch increments are for typo fixes, metadata fixes, or non-behavioral changes
- Minor increments are for compatible test additions, clearer instructions, or stricter validation that preserves intended behavior
- Major increments are for incompatible changes to requirements, inputs, outputs, environment, public tests, or scoring

Historical versions used in published results MUST remain reproducible.

## 5. Canonical Task File

Each task MUST include a canonical YAML file named `task.yaml`.

Required top-level fields:

```yaml
id:
spec_version:
task_version:
title:
description:
difficulty:
category:
tags:
dataset:
curriculum:
rollout_capture:
benchmarking:
instruction:
success_criteria:
environment:
interfaces:
tests:
timeouts:
scoring:
security:
dependencies:
artifacts:
provenance:
reference_solution:
```

Optional top-level fields:

```yaml
maintainers:
changelog:
known_failure_modes:
notes:
```

Unknown top-level fields MUST fail validation unless explicitly namespaced under `x_`.

## 6. Required Field Contract

### 6.1 `title`

Human-readable task title.

Rules:

- MUST be 8 to 90 characters
- MUST NOT reveal hidden tests or implementation strategy
- SHOULD describe the product behavior, not the category label

Example:

```yaml
title: Cursor-paginated todo API with idempotent writes
```

### 6.2 `description`

Short benchmark-facing description.

Rules:

- MUST explain the domain context
- MUST NOT include unnecessary implementation hints
- MUST NOT mention hidden tests
- SHOULD be under 250 words

### 6.3 `difficulty`

Structured difficulty declaration.

```yaml
difficulty:
  level: 3
  rationale: Requires persistent state, validation, idempotency, and pagination edge cases.
  expected_code_size:
    min_lines: 180
    max_lines: 550
  expected_concepts:
    - HTTP routing
    - input validation
    - idempotency keys
    - cursor pagination
```

Rules:

- `level` MUST be an integer from 1 to 5
- `rationale` MUST explain why the level was chosen
- `expected_code_size` is advisory and MUST NOT be directly scored
- `expected_concepts` SHOULD map to tested behaviors

Difficulty levels:

- Level 1: one endpoint or narrow behavior, no persistence beyond memory, few edge cases
- Level 2: multiple endpoints, simple state, validation, basic errors
- Level 3: persistence, cross-endpoint invariants, pagination, auth, or background behavior
- Level 4: concurrency, authorization boundaries, migrations, observability, queues, or failure recovery
- Level 5: multi-component systems, adversarial security cases, distributed-state simulation, or complex migrations

### 6.4 `category`

Primary category.

Allowed values:

- `http-apis`
- `crud-systems`
- `authentication`
- `authorization`
- `middleware`
- `websockets`
- `background-jobs`
- `file-uploads`
- `validation`
- `databases`
- `caching`
- `observability`
- `rate-limiting`
- `error-handling`
- `testing`
- `security`

Each task MUST have exactly one primary category. Cross-cutting topics belong in `tags`.

### 6.5 `tags`

Search and stratification tags.

Rules:

- MUST be a non-empty list
- MUST use lowercase kebab-case
- MUST include the primary category
- SHOULD include framework, data-store, protocol, and risk tags when applicable

Example:

```yaml
tags:
  - http-apis
  - bun
  - sqlite
  - cursor-pagination
  - idempotency
```

### 6.6 `dataset`

Dataset metadata used to prevent accidental training/evaluation mixing.

```yaml
dataset:
  split: dev
  leakage_group: http-apis.todo-health
  trainable: true
```

Rules:

- `split` MUST be one of `train`, `dev`, `public_eval`, or `private_eval`
- `leakage_group` MUST identify the family of tasks that should not be split across train and eval sets
- `trainable` MUST state whether task prompts, public tests, and permitted artifacts can be exported for training
- `private_eval` tasks MUST have `trainable: false`

The v0 contract does not require behavior graphs, semantic clustering, canary tasks, or embargoes. Those may be added later as dataset controls mature.

### 6.7 `curriculum`

Curriculum metadata used to build balanced task sets for small specialized models.

```yaml
curriculum:
  skill_atoms:
    - bun-http-server
    - json-response
    - route-matching
  small_model_suitability: high
```

Rules:

- `skill_atoms` MUST be a non-empty list of concrete capability labels
- `small_model_suitability` MUST be one of `low`, `medium`, or `high`
- Skill atoms SHOULD describe reusable implementation capabilities, not broad categories

### 6.8 `rollout_capture`

Rollout capture policy for agent runs.

```yaml
rollout_capture:
  enabled: true
```

Rules:

- `enabled` MUST be present
- When enabled, runners SHOULD emit rollout artifacts such as step events, final patches, token usage, and command timelines
- v0 does not require dense RL reward events

### 6.9 `benchmarking`

Benchmarking metric declarations for agent and application evaluation.

```yaml
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

Rules:

- `agent_metrics` MUST be a non-empty list of model or agent execution metrics
- `app_metrics` MUST be a non-empty list of submitted application metrics
- Metrics SHOULD be stable names that result artifacts can report consistently

### 6.10 `instruction`

The exact instruction given to the agent.

```yaml
instruction:
  prompt_file: prompt.md
  summary: Build a Bun HTTP API for todo creation, listing, and idempotent updates.
  constraints:
    - The service must listen on the port provided by PORT.
    - The API must return JSON for every response.
    - Do not require external network access.
  allowed_assumptions:
    - The process is started from the repository root.
    - The database path is provided by DATABASE_URL when persistence is required.
  disallowed_shortcuts:
    - Hard-coding responses for known test inputs.
    - Reading files under tests/hidden.
    - Changing test files or runner files.
```

Rules:

- `prompt_file` MUST point to a UTF-8 markdown file in the task package
- `summary` MUST be short enough for listings
- `constraints` MUST include execution assumptions needed by tests
- `disallowed_shortcuts` MUST explicitly prohibit known gaming vectors

The prompt file is the only user-facing instruction Harbor SHOULD pass to the agent unless Harbor supports structured metadata display.

### 6.11 `success_criteria`

Behavioral requirements that define a correct solution.

```yaml
success_criteria:
  must:
    - POST /todos creates a todo with a server-generated id.
    - GET /todos returns todos sorted by creation time ascending.
    - Repeated POST requests with the same Idempotency-Key return the original response.
  must_not:
    - Return stack traces to clients.
    - Accept unknown fields silently.
  edge_cases:
    - Empty request body returns 400 with a JSON error.
    - Cursor values from another query shape are rejected.
```

Rules:

- MUST be testable through automated checks
- MUST separate required behavior from prohibited behavior
- SHOULD include edge cases that prevent shallow implementations
- MUST NOT include subjective style criteria

### 6.12 `environment`

Execution environment contract.

```yaml
environment:
  runtime: bun
  bun_version: ">=1.1.0 <2.0.0"
  os: linux
  architecture: x86_64
  network: disabled
  filesystem:
    writable:
      - .
      - /tmp
    readonly:
      - tests
      - runner
  env:
    required:
      PORT: allocated by runner
    optional:
      DATABASE_URL: sqlite://./data/app.db
  services:
    - name: sqlite
      mode: file
```

Rules:

- MUST declare runtime and compatible version range
- MUST declare network policy
- MUST declare writable paths
- MUST declare required environment variables
- MUST NOT depend on undeclared external services

Tasks SHOULD be executable with network disabled after dependencies are installed or vendored.

### 6.13 `interfaces`

The externally observable interface under test.

```yaml
interfaces:
  process:
    start_command: bun run start
    readiness:
      type: http
      path: /health
      expected_status: 200
  http:
    base_url_env: BASE_URL
    endpoints:
      - method: POST
        path: /todos
      - method: GET
        path: /todos
```

Rules:

- MUST define how the runner starts and detects readiness
- MUST define every primary external interface
- MUST use environment-assigned ports
- MUST NOT require privileged ports

Supported interface types:

- HTTP
- WebSocket
- CLI
- worker queue
- file-system artifact

### 6.14 `tests`

Public and hidden test contract.

```yaml
tests:
  public:
    command: bun test tests/public
    files:
      - tests/public/todo_api.test.ts
    weight: 0.25
  hidden:
    command: bun test tests/hidden
    files:
      - tests/hidden/idempotency.test.ts
      - tests/hidden/pagination_edges.test.ts
    weight: 0.65
  metamorphic:
    command: bun test tests/metamorphic
    weight: 0.10
  mutation_policy:
    seed_env: BUN_BENCH_SEED
    deterministic: true
```

Rules:

- MUST include at least one public test suite
- MUST include at least one hidden or generated test suite for scored benchmark runs
- MUST specify commands relative to the task root
- MUST declare deterministic seed behavior for randomized tests
- MUST NOT allow solution code to discover hidden test contents at runtime

Public tests are for orientation, not complete scoring. Hidden tests MUST cover edge cases and gaming vectors.

### 6.15 `timeouts`

Execution time limits.

```yaml
timeouts:
  install_seconds: 120
  start_seconds: 15
  readiness_seconds: 10
  test_seconds: 60
  total_seconds: 180
  idle_seconds: 20
```

Rules:

- MUST define every timeout listed above
- MUST be enforceable by the runner
- SHOULD scale with difficulty
- MUST NOT reward sleeping, long polling, or background retries that outlive the test

### 6.16 `scoring`

Scoring formula and gates.

```yaml
scoring:
  max_score: 100
  gates:
    - name: installs
      requirement: install exits with status 0
      on_fail: zero
    - name: starts
      requirement: readiness check passes
      on_fail: zero
    - name: security_baseline
      requirement: no forbidden file access or network egress
      on_fail: zero
  weights:
    correctness: 0.70
    edge_cases: 0.15
    performance: 0.05
    security: 0.07
    maintainability: 0.03
  performance:
    metric: p95_latency_ms
    budget: 100
    floor: 20
  dependency_budget:
    max_runtime_dependencies: 8
    penalty_per_extra_dependency: 1
```

Rules:

- Correctness MUST be the dominant score component
- Style-only criteria MUST NOT exceed 5 percent of total score
- Dependency count MAY only be a small penalty, never a primary objective
- Performance MUST be scored against task-specific budgets, not absolute global numbers
- Security violations that compromise the benchmark MUST zero the run

Recommended base formula:

```text
score =
  gate_multiplier *
  clamp(0, 100,
    100 * (
      0.70 * correctness_ratio +
      0.15 * edge_case_ratio +
      0.05 * performance_ratio +
      0.07 * security_ratio +
      0.03 * maintainability_ratio
    )
    - dependency_penalty
  )
```

`gate_multiplier` is `0` if any zeroing gate fails and `1` otherwise.

Maintainability MUST be computed from objective checks, such as lint success, typecheck success, module boundaries, or absence of forbidden patterns. It MUST NOT depend on subjective reviewer preference.

### 6.17 `security`

Security policy for task execution and application behavior.

```yaml
security:
  sandbox:
    network_egress: denied
    filesystem_hidden_tests: denied
    process_spawn: restricted
  app_requirements:
    - Do not expose stack traces.
    - Validate JSON body shape before using values.
    - Reject path traversal in uploaded filenames.
  forbidden_patterns:
    - reading tests/hidden
    - modifying package manager lockfiles during test execution
    - opening outbound sockets
```

Rules:

- MUST define sandbox expectations
- MUST define application security requirements for security-relevant tasks
- MUST list benchmark integrity violations
- MUST distinguish app-level security failures from benchmark-compromise failures

### 6.18 `dependencies`

Allowed and forbidden dependency policy.

```yaml
dependencies:
  package_manager: bun
  install_command: bun install --frozen-lockfile
  allow_additional: true
  allowlist:
    - "@elysiajs/*"
    - "hono"
    - "zod"
  denylist:
    - "express-generator"
    - "sqlite-web"
  network_during_install: allowed
  network_during_tests: denied
```

Rules:

- MUST declare package manager and install command
- MUST declare whether agents may add dependencies
- MUST distinguish install-time network from test-time network
- SHOULD use allowlists for generated public benchmark suites
- MUST record the final dependency graph in result artifacts

Dependency count MUST NOT be used to punish legitimate production-quality choices except through a documented small penalty.

### 6.19 `artifacts`

Files emitted by the runner.

```yaml
artifacts:
  required:
    - result.json
    - junit.xml
    - logs/stdout.log
    - logs/stderr.log
    - metrics.json
  optional:
    - coverage/lcov.info
    - trace.json
```

Rules:

- MUST identify required artifacts
- MUST use stable filenames
- MUST avoid including hidden test source in exported artifacts
- MUST include enough data to reproduce score calculations

### 6.20 `provenance`

Authorship and generation metadata.

```yaml
provenance:
  source: generated
  generator:
    name: crud-template-generator
    version: 0.3.1
    seed: 183746
    template_id: crud.cursor-pagination
    parameter_hash: sha256:...
  authors:
    - tinycomputer.ai
  created_at: "2026-06-16T00:00:00Z"
  license: Apache-2.0
```

Rules:

- `source` MUST be one of `authored`, `generated`, or `hybrid`
- Generated tasks MUST include generator name, version, seed, template id, and parameter hash
- Authored tasks SHOULD include reviewer identity or team ownership
- Public benchmark releases MUST include reproducible provenance

Provenance is mandatory because generated tasks create leakage, duplication, and memorization risks.

### 6.21 `reference_solution`

Reference implementation metadata.

```yaml
reference_solution:
  visibility: private
  path: solutions/reference
  validation_command: bun test tests/public tests/hidden tests/metamorphic
  expected_score: 100
  notes: Uses SQLite and idempotency keys persisted in a separate table.
```

Rules:

- MUST exist for task acceptance
- SHOULD be private for public benchmark tasks
- MUST pass all required tests before task release
- MUST NOT be included in agent-visible task packages unless the package is explicitly a training package

Reference solutions are validation tools, not scoring or style templates.

## 7. Optional Field Contract

### 7.1 `maintainers`

```yaml
maintainers:
  - team: benchmark-infra
    contact: benchmarks@tinycomputer.ai
```

### 7.2 `changelog`

```yaml
changelog:
  - version: 1.0.0
    date: "2026-06-16"
    changes:
      - Initial release.
```

Every published task version SHOULD include a changelog entry.

### 7.3 `known_failure_modes`

Known incomplete or fragile solution patterns.

```yaml
known_failure_modes:
  - In-memory idempotency storage loses behavior across process restart.
  - Offset pagination fails when items are inserted between requests.
```

This field MUST NOT be shown to agents in scored runs.

### 7.4 `notes`

Maintainer-only notes. MUST NOT affect validation or scoring.

## 8. Package Layout

A task package MUST use this layout:

```text
tasks/{task_id}/
  task.yaml
  prompt.md
  package.json
  bun.lockb
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

Visibility rules:

- Agent-visible package: `task.yaml`, `prompt.md`, starter files, public tests, fixtures marked public
- Runner-visible package: all tests, validators, runner files, scoring files
- Maintainer-visible package: reference solution, generator metadata, known failure modes

The Harbor adapter MUST construct the correct package view for the run type.

## 9. Agent-Visible Prompt Rules

`prompt.md` MUST be self-contained enough for a competent agent to solve the task without reading hidden metadata.

It MUST include:

- desired behavior
- API contract or interface contract
- setup command if different from repository defaults
- environment variables
- examples of valid and invalid inputs
- expected error shape when relevant
- constraints on persistence, dependencies, and network access

It MUST NOT include:

- hidden test names
- hidden edge-case list beyond what is part of the intended spec
- reference solution details
- scoring weights
- generated seed or parameter hash

The prompt SHOULD be precise enough that hidden tests verify the written contract rather than surprise behavior.

## 10. Validation Lifecycle

Task validation has four phases:

### 10.1 Schema Validation

Checks:

- `task.yaml` matches the JSON Schema for `spec_version`
- all required fields exist
- enum values are valid
- paths are relative and remain within the task directory
- weights sum to `1.0`
- timeout values are positive integers

Failure result: task is invalid and MUST NOT run.

### 10.2 Static Integrity Validation

Checks:

- hidden tests are not reachable from agent-visible package
- reference solution is not included in agent-visible package
- no absolute paths are embedded in task commands
- no task command requires undeclared network access
- public prompt does not mention hidden paths or solution files
- dependency policy is consistent with lockfile state

Failure result: task is invalid and MUST NOT be released.

### 10.3 Reference Solution Validation

Checks:

- reference solution installs from a clean checkout
- reference solution passes public, hidden, and metamorphic tests
- reference solution score matches `expected_score`
- reference solution stays within declared timeouts
- metrics are captured successfully

Failure result: task is blocked from release.

### 10.4 Baseline Failure Validation

Checks:

- empty starter solution fails meaningful tests
- trivial hard-coded solution fails hidden or metamorphic tests
- public-only overfit solution does not achieve high score
- common invalid implementations are caught

Failure result: task must add stronger tests or change success criteria.

## 11. Scored Run Lifecycle

A scored run follows this lifecycle:

1. Prepare an isolated workspace.
2. Materialize the agent-visible task package.
3. Run the agent with `prompt.md` and allowed metadata.
4. Install dependencies using the declared install command.
5. Start the submitted service using `interfaces.process.start_command`.
6. Wait for readiness.
7. Execute public tests.
8. Execute hidden tests.
9. Execute metamorphic or generated tests with declared seed.
10. Collect logs, metrics, dependency graph, and test reports.
11. Apply scoring gates.
12. Compute weighted score.
13. Export result artifacts.

The runner MUST treat setup failure, install failure, start failure, timeout, and sandbox violation as distinct outcomes.

## 12. Result Artifact Contract

Every run MUST produce `result.json`.

```json
{
  "task_id": "http-apis.todo-pagination.v1",
  "task_version": "1.0.0",
  "spec_version": "0.1.0",
  "run_id": "01J...",
  "agent_id": "agent-name-or-model",
  "started_at": "2026-06-16T00:00:00Z",
  "completed_at": "2026-06-16T00:02:00Z",
  "status": "completed",
  "score": 87.4,
  "max_score": 100,
  "outcome": {
    "install": "passed",
    "start": "passed",
    "readiness": "passed",
    "tests": "failed",
    "sandbox": "passed"
  },
  "components": {
    "correctness": 0.82,
    "edge_cases": 0.71,
    "performance": 0.93,
    "security": 1.0,
    "maintainability": 0.8
  },
  "metrics": {
    "p95_latency_ms": 41,
    "runtime_ms": 113492,
    "max_rss_mb": 146,
    "input_tokens": 18342,
    "output_tokens": 2914,
    "tool_calls": 18
  },
  "artifacts": {
    "junit": "junit.xml",
    "stdout": "logs/stdout.log",
    "stderr": "logs/stderr.log",
    "rollout": "rollout.jsonl"
  }
}
```

Rules:

- MUST include task identity and versions
- MUST include status and outcome breakdown
- MUST include component scores before weighting
- MUST include enough metrics to audit performance scoring
- SHOULD include declared `benchmarking.agent_metrics` and `benchmarking.app_metrics` when collected
- SHOULD include `rollout.jsonl` when `rollout_capture.enabled` is true
- MUST NOT include hidden test source, secrets, or reference solution code

## 13. Harbor Integration Contract

Harbor is treated as the execution engine. Because the precise Harbor API may evolve, `bun-bench` MUST isolate Harbor-specific behavior behind an adapter.

### 13.1 Harbor Adapter Responsibilities

The adapter MUST:

- translate `task.yaml` into Harbor task metadata
- materialize the correct visibility view for the run type
- pass `prompt.md` as the primary agent instruction
- inject declared environment variables
- enforce timeouts where Harbor does not
- collect declared artifacts
- normalize Harbor outcomes into `result.json`
- preserve task id, task version, spec version, run id, and seed

The adapter MUST NOT:

- change task scoring semantics
- expose hidden tests to the agent
- silently ignore unsupported fields
- merge results across task versions
- mutate task packages during execution

### 13.2 Harbor Package Views

Supported package views:

- `training`: prompt, starter files, public tests, optional public solution notes
- `evaluation`: prompt, starter files, public tests, hidden tests available only to runner
- `validation`: full package, including hidden tests and reference solution
- `maintenance`: full package plus generator metadata and maintainer notes

The default public benchmark run MUST use `evaluation`.

### 13.3 Harbor Result Mapping

Harbor statuses MUST map to normalized statuses:

- `queued`
- `running`
- `completed`
- `failed_install`
- `failed_start`
- `failed_tests`
- `timed_out`
- `sandbox_violation`
- `infrastructure_error`
- `invalid_task`

Infrastructure errors MUST NOT be scored as agent failures unless retry policy has been exhausted and the cause is attributable to the submission.

## 14. Benchmark Gaming Vectors

Task authors MUST consider these attacks:

- hard-coding responses for public test inputs
- detecting test order, test names, or known headers
- reading hidden tests from disk
- modifying tests or runner files
- using outbound network calls for answers or persistence
- relying on wall-clock timing to identify benchmark phases
- returning acceptable JSON shapes without implementing state transitions
- using broad catch-all handlers that mask validation failures
- gaming dependency count by vendoring large code
- adding slow retries that pass small tests but fail under load
- exploiting shared state across runs
- memorizing generated task variants

Required mitigations:

- hidden tests MUST use input values not present in public tests
- generated tests SHOULD randomize non-semantic names and values with a recorded seed
- metamorphic tests SHOULD verify invariants across equivalent input transformations
- runners MUST make hidden tests unreadable to solution code when possible
- runners MUST detect test and runner file modifications
- network egress MUST be denied during scored tests unless explicitly required
- task packages MUST be isolated per run
- result scoring MUST include sandbox violations as zeroing gates

## 15. Dataset Generation Contract

Generated tasks MUST be valid tasks under this contract. Generation is not allowed to bypass validation.

### 15.1 Template Model

A generator MUST define:

- template id
- parameter schema
- constraint rules
- difficulty mapping
- category mapping
- public prompt renderer
- test renderer
- reference solution renderer or reference oracle
- deduplication signature

### 15.2 Parameter Constraints

Parameters MUST satisfy explicit constraints.

Example:

```yaml
template_id: crud.cursor-pagination
parameters:
  resource_name:
    type: noun
    uniqueness_scope: template
  fields:
    min: 3
    max: 8
  auth_required:
    type: boolean
  pagination:
    enum:
      - cursor
      - keyset
constraints:
  - if auth_required then category includes authentication or authorization tag
  - cursor field must be unique and monotonically ordered
  - at least one hidden test must cover invalid cursor format
```

### 15.3 Deduplication

Generators MUST compute:

- exact signature: hash of normalized task parameters
- semantic signature: hash of normalized behavior graph
- prompt signature: hash of normalized public instruction

Generated tasks MUST be rejected when:

- exact signature already exists
- semantic signature collides with an existing task in the same split
- prompt similarity exceeds the configured threshold for the same behavior graph

### 15.4 Dataset Splits

Every task MUST declare v0 dataset metadata:

```yaml
dataset:
  split: public_eval
  leakage_group: crud.cursor-pagination.todos
  trainable: false
```

Rules:

- `split` MUST be one of `train`, `dev`, `public_eval`, or `private_eval`
- `leakage_group` MUST be present for authored and generated tasks
- `trainable` MUST be present for authored and generated tasks
- `private_eval` tasks MUST have `trainable: false`
- Reference solutions for evaluation tasks MUST NOT be included in training exports
- Train and evaluation split manifests SHOULD avoid sharing the same `leakage_group`
- More advanced controls such as behavior graphs, semantic clustering, canary tasks, and embargoes are out of scope for v0

### 15.5 Generation Risks

Known risks:

- syntactic variety without behavioral variety
- accidental duplicate tasks under different nouns
- hidden tests that only check generator artifacts
- reference solution bugs copied into tests
- tasks that reward template memorization rather than backend reasoning
- leaked generated seeds enabling reconstruction
- unrealistic domains that cause agents to optimize for benchmark quirks

Required controls:

- generator output MUST pass authored validation gates
- sampled generated tasks SHOULD receive human review before release
- every generator version MUST have a regression suite
- generated tasks MUST include adversarial baseline checks
- release manifests MUST include diversity and duplication reports

## 16. Versioning and Evolution

Task evolution rules:

- Compatible clarifications: patch version
- Additional tests for already specified behavior: minor version
- Changed expected API shape: major version
- Changed persistence semantics: major version
- Changed scoring weights only: minor version if scores are not compared with prior version, major version if leaderboard continuity would be broken
- Changed hidden tests only: minor version when testing existing criteria, major version when new behavior is required

Leaderboard rules:

- Scores MUST be compared only within the same task id and compatible task version range
- Public reports MUST include task version and spec version
- Deprecated tasks SHOULD remain runnable for historical comparison
- Removed tasks MUST have a documented reason

## 17. Acceptance Checklist

A task is releasable only when all checks pass:

- `task.yaml` validates against schema
- prompt is clear and self-contained
- public tests demonstrate basic expectations
- hidden tests cover edge cases and overfitting risks
- metamorphic tests exist when the task has transformable invariants
- reference solution passes with expected score
- empty starter fails
- public-test overfit baseline fails hidden tests
- sandbox policy is enforceable
- package visibility rules are verified
- result artifact includes all required fields
- generation provenance is present for generated tasks
- `dataset`, `curriculum`, `rollout_capture`, and `benchmarking` metadata are present
- private evaluation tasks are marked non-trainable
- split and leakage metadata are present for dataset exports
- Harbor adapter can execute the task without special-case code

## 18. Minimal Example

```yaml
id: http-apis.todo-pagination.v1
spec_version: 0.1.0
task_version: 1.0.0
title: Cursor-paginated todo API with idempotent creates
description: Build a Bun HTTP API that creates, lists, and retrieves todo items while preserving idempotency for duplicate create requests.
difficulty:
  level: 3
  rationale: Requires validation, persistent state, pagination semantics, and idempotency.
  expected_code_size:
    min_lines: 180
    max_lines: 550
  expected_concepts:
    - HTTP routing
    - JSON validation
    - cursor pagination
    - idempotency
category: http-apis
tags:
  - http-apis
  - bun
  - json
  - cursor-pagination
  - idempotency
dataset:
  split: dev
  leakage_group: http-apis.todo-pagination
  trainable: true
curriculum:
  skill_atoms:
    - http-routing
    - json-validation
    - cursor-pagination
    - idempotency
  small_model_suitability: medium
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
instruction:
  prompt_file: prompt.md
  summary: Build a todo API with cursor pagination and idempotent creates.
  constraints:
    - Listen on PORT.
    - Return JSON for every response.
    - Do not use external network access.
  allowed_assumptions:
    - The process starts from the task root.
  disallowed_shortcuts:
    - Do not hard-code test inputs.
    - Do not read tests/hidden.
success_criteria:
  must:
    - POST /todos creates a todo item.
    - GET /todos lists todo items using cursor pagination.
    - Duplicate POST requests with the same Idempotency-Key return the original response.
  must_not:
    - Return stack traces.
    - Accept unknown JSON fields.
  edge_cases:
    - Invalid cursor values return 400.
    - Empty title values return 422.
environment:
  runtime: bun
  bun_version: ">=1.1.0 <2.0.0"
  os: linux
  architecture: x86_64
  network: disabled
  filesystem:
    writable:
      - .
      - /tmp
    readonly:
      - tests
      - runner
  env:
    required:
      PORT: allocated by runner
    optional: {}
  services: []
interfaces:
  process:
    start_command: bun run start
    readiness:
      type: http
      path: /health
      expected_status: 200
  http:
    base_url_env: BASE_URL
    endpoints:
      - method: POST
        path: /todos
      - method: GET
        path: /todos
tests:
  public:
    command: bun test tests/public
    files:
      - tests/public/todo_api.test.ts
    weight: 0.25
  hidden:
    command: bun test tests/hidden
    files:
      - tests/hidden/idempotency.test.ts
    weight: 0.65
  metamorphic:
    command: bun test tests/metamorphic
    weight: 0.10
  mutation_policy:
    seed_env: BUN_BENCH_SEED
    deterministic: true
timeouts:
  install_seconds: 120
  start_seconds: 15
  readiness_seconds: 10
  test_seconds: 60
  total_seconds: 180
  idle_seconds: 20
scoring:
  max_score: 100
  gates:
    - name: installs
      requirement: install exits with status 0
      on_fail: zero
    - name: starts
      requirement: readiness check passes
      on_fail: zero
    - name: security_baseline
      requirement: no hidden test access or network egress
      on_fail: zero
  weights:
    correctness: 0.70
    edge_cases: 0.15
    performance: 0.05
    security: 0.07
    maintainability: 0.03
  performance:
    metric: p95_latency_ms
    budget: 100
    floor: 20
  dependency_budget:
    max_runtime_dependencies: 8
    penalty_per_extra_dependency: 1
security:
  sandbox:
    network_egress: denied
    filesystem_hidden_tests: denied
    process_spawn: restricted
  app_requirements:
    - Validate JSON before using values.
    - Do not expose stack traces.
  forbidden_patterns:
    - reading tests/hidden
    - modifying runner files
dependencies:
  package_manager: bun
  install_command: bun install --frozen-lockfile
  allow_additional: true
  allowlist:
    - hono
    - zod
  denylist: []
  network_during_install: allowed
  network_during_tests: denied
artifacts:
  required:
    - result.json
    - junit.xml
    - logs/stdout.log
    - logs/stderr.log
    - metrics.json
  optional:
    - coverage/lcov.info
provenance:
  source: authored
  authors:
    - tinycomputer.ai
  created_at: "2026-06-16T00:00:00Z"
  license: Apache-2.0
reference_solution:
  visibility: private
  path: solutions/reference
  validation_command: bun test tests/public tests/hidden tests/metamorphic
  expected_score: 100
```
