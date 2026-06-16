# Agent Execution

Phase 4 agent runner for executing coding agents against bun-bench tasks and writing scored result artifacts under `runs/`.

## Command

Run a single task:

```sh
bun run run:agent \
  --task tasks/http-apis.todo-health.v1 \
  --agent claude-code
```

Run the full suite with any supported agent:

```sh
bun run run:suite --agent claude-code --tasks 'tasks/**'
bun run run:suite --agent codex-cli  --tasks 'tasks/**'
bun run run:suite --agent gpt-5      --tasks 'tasks/**'
```

## Supported Agents

| Agent ID | Status | Description |
| --- | --- | --- |
| `claude-code` | implemented | Anthropic Claude Code CLI (`claude -p`) |
| `codex-cli` | implemented | OpenAI Codex CLI (`codex exec`) |
| `gpt-5` | implemented | GPT-5 via the OpenAI Codex CLI harness (`codex exec --model gpt-5`) |
| `aider` | planned | Aider |
| `opencode` | planned | OpenCode |

All three implemented agents share the same workspace materialization, prompt
construction, validation lifecycle, scoring, and `result.json` schema. They
differ only in how the agent phase is executed.

## Lifecycle

1. Validate the task with `validators/validate-task.ts`.
2. Create `runs/<timestamp>-<task-id>/`.
3. Materialize an agent-visible workspace under `runs/.../workspace/` (starter files only).
4. Construct the agent prompt from `prompt.md` and `task.yaml` instruction metadata.
5. Run the selected agent against the workspace.
6. Execute the validation lifecycle:
   - install dependencies
   - start the submitted service
   - wait for HTTP readiness
   - run public tests from the workspace
   - run hidden tests from the original task package
7. Capture stdout/stderr logs for each phase.
8. Enforce declared timeouts.
9. Write `result.json`.

## Agent Interface

All agents implement a common interface in `agents/types.ts`:

```typescript
interface Agent {
  readonly id: string;
  prepare(context: AgentContext): Promise<void>;
  run(context: AgentContext): Promise<AgentRunOutcome>;
  cleanup(context: AgentContext): Promise<void>;
}
```

- `prepare()` verifies the agent binary is available and writes run artifacts (for example, the resolved prompt).
- `run()` executes the agent in the materialized workspace and returns exit status plus metrics.
- `cleanup()` releases resources after the run (always called, even on failure).

Register new agents in `agents/registry.ts`.

## Prompt Construction

The runner builds the agent prompt from:

1. `instruction.prompt_file` (typically `prompt.md`)
2. Optional metadata appended from `task.yaml`:
   - `instruction.summary`
   - `instruction.constraints`
   - `instruction.allowed_assumptions`
   - `instruction.disallowed_shortcuts`

Hidden tests, reference solutions, scoring weights, and runner internals are never included.

## Output Layout

```
runs/<timestamp>-<task-id>/
  result.json
  workspace/
  logs/
    agent-prompt.md
    agent.stdout.log
    agent.stderr.log
    install.stdout.log
    install.stderr.log
    start.stdout.log
    start.stderr.log
    public-tests.stdout.log
    public-tests.stderr.log
    hidden-tests.stdout.log
    hidden-tests.stderr.log
```

## result.json (Agent Runs)

Agent runs extend the local runner result with agent-specific fields:

| Field | Description |
| --- | --- |
| `agent_id` | Agent identifier (for example, `claude-code`) |
| `mode` | Always `"agent"` |
| `outcome.agent` | Agent phase outcome (`passed`, `failed`, or `skipped`) |
| `durations.agent_ms` | Wall time spent in the agent phase |
| `metrics` | Agent metrics (`wall_time_ms`, token counts when available) |

### Status Values

All local runner statuses apply, plus:

- `failed_agent` — the agent exited with a non-zero status

### Scoring (v0)

Scoring matches the local runner gate model:

| Outcome | Score |
| --- | --- |
| Agent failure | 0 |
| Install failure | 0 |
| Start/readiness failure | 0 |
| Public tests fail | 0 |
| Public pass, hidden fail | 25 |
| Public and hidden pass | 100 |

## Claude Code Setup

Install the Claude Code CLI and authenticate before running:

```sh
claude --version
claude auth
```

The runner invokes:

```sh
claude -p --dangerously-skip-permissions --output-format json
```

with the constructed prompt on stdin, from the materialized workspace directory.

Token usage (`input_tokens`, `output_tokens`) and `tool_calls` (`num_turns`) are
parsed from the final JSON object on stdout.

## Codex CLI Setup (`codex-cli`)

Install the OpenAI Codex CLI and authenticate before running:

```sh
codex --version
codex login            # ChatGPT sign-in, or set OPENAI_API_KEY in the environment
```

The runner invokes, from the materialized workspace directory:

```sh
codex exec --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox "<prompt>"
```

- `exec` runs Codex non-interactively (no TUI).
- `--dangerously-bypass-approvals-and-sandbox` lets it edit files and run
  commands without prompts, matching the isolated per-run workspace model.
- `--skip-git-repo-check` allows execution inside the generated `runs/` workspace.
- `--json` emits a JSONL event stream; token usage is parsed best-effort from the
  usage / `token_count` events (kept as the last cumulative counts). When usage is
  absent, only `wall_time_ms` is reported.

## GPT-5 Setup (`gpt-5`)

The `gpt-5` agent evaluates the GPT-5 model **through the same Codex CLI harness**,
with the model pinned:

```sh
codex exec --json --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --model gpt-5 "<prompt>"
```

It therefore shares all Codex setup (install + auth) and only adds `--model gpt-5`.
This keeps `gpt-5` a true file-editing coding agent that produces a working
solution in the workspace, rather than a single-shot completion. To evaluate a
different model through the same path, add another `CodexCliAgent` to the registry
with a different `model` option. Requires that the authenticated account has
access to the `gpt-5` model; otherwise the agent phase exits non-zero
(`failed_agent`).

## Adding a New Agent

1. Create `agents/<agent-id>.ts` implementing the `Agent` interface.
2. Register the agent in `agents/registry.ts`.
3. Document setup requirements in this file.
4. Run a task to verify `result.json` is produced.

## Known Limitations

- Harbor adapter, rollout capture, and RL are not implemented.
- Only HTTP readiness checks are supported.
- Metamorphic tests are not executed.
- Scoring v0 is gate-based; weighted component scoring from `task.yaml` is not applied.
- Sandbox/network isolation from the task spec is not enforced locally.
- Agent timeout shares the task `timeouts.total_seconds` budget with validation phases.

## Implementation Layout

```
agents/
  types.ts          # Agent interface
  process.ts        # Shared subprocess helpers (spawn/pipe/timeout/PATH check)
  claude-code.ts    # Claude Code implementation
  codex-cli.ts      # OpenAI Codex CLI implementation (shared base)
  gpt-5.ts          # GPT-5 via Codex CLI (model-pinned subclass)
  registry.ts       # Agent factory
runners/agent/
  run-agent.ts      # CLI entry point
  runner.ts         # Orchestration
  prompt.ts         # Prompt construction
  result.ts         # Agent result builder
runners/suite/
  run-suite.ts      # Suite CLI entry point (--agent <id>)
runners/shared/
  validation.ts     # Shared install/start/test lifecycle
```
