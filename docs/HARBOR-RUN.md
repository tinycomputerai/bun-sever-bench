# Verified Harbor Run

A single bun-bench task exported and executed end-to-end by Harbor, using the
`oracle` agent (the reference solution) so the run is deterministic and requires
no LLM/API spend. This is the Phase 6 acceptance artifact.

## Environment

- Harbor `0.13.1`
- Docker `29.4.0` (environment type `docker`)
- Base image `oven/bun:1`
- Task: `databases.optimistic-version.v1`

## Commands

```sh
bun run harbor:export --task tasks/databases.optimistic-version.v1
# -> harbor/databases-optimistic-version-v1

harbor run \
  -p harbor/databases-optimistic-version-v1 \
  --agent oracle \
  -e docker \
  -y \
  -o jobs --job-name bunbench-oracle-verify
```

## Result

```
adhoc • oracle
┏━━━━━━━━┳━━━━━━━━━━━━┳━━━━━━━┓
┃ Trials ┃ Exceptions ┃  Mean ┃
┡━━━━━━━━╇━━━━━━━━━━━━╇━━━━━━━┩
│      1 │          0 │ 1.000 │
└────────┴────────────┴───────┘

┏━━━━━━━━┳━━━━━━━┓
┃ Reward ┃ Count ┃
┡━━━━━━━━╇━━━━━━━┩
│ 1.0    │     1 │
└────────┴───────┘

Total runtime: 27s
Results written to jobs/bunbench-oracle-verify/result.json
```

Verifier output (`verifier/test-stdout.txt`):

```
bun-bench verifier: public_exit=0 hidden_exit=0 reward=1.0
```

- public suite: `Ran 3 tests across 1 file` — 0 fail
- hidden suite: `Ran 7 tests across 1 file` — 0 fail
- `verifier/reward.txt` → `1.0`

Applying the normalization mapping (`docs/HARBOR.md`), reward `1.0` → bun-bench
`score: 100`, `status: completed` — matching the local runner's score for the
reference solution of this task. The Harbor path is therefore the primary engine
and produces results consistent with the bun-bench scoring contract.

## Job artifacts

```
jobs/bunbench-oracle-verify/
  result.json                                   # job-level stats (mean reward 1.0)
  config.json
  databases-optimistic-version-v1__<id>/
    result.json                                 # trial result
    agent/oracle.txt
    verifier/reward.txt                         # 1.0
    verifier/public.log
    verifier/hidden.log
    verifier/test-stdout.txt
```

## Suite export

All authored tasks export to valid Harbor packages:

```sh
bun run harbor:export-suite --tasks 'tasks/**'
# -> exported 35/35 task(s) to harbor
#    (35/35 pass Harbor's Task.is_valid_dir)
```
