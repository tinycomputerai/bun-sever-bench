# Releasing bun-bench

Manual release automation for bun-bench. Releases are triggered from GitHub
Actions only — there is no auto-release on push.

The workflow never creates git tags, never bumps package versions, and never
publishes to npm. You create and push the tag yourself, then run the workflow
against that existing tag.

The benchmark repository contains source code, tasks, schemas, docs, and release
tooling only. Large generated JSONL exports are **not** committed to git history.

Release datasets are staged locally under `release-assets/` (gitignored), uploaded
to Hugging Face staging before the tag, and fetched by the release workflow at
publish time.

## Overview

A release publishes three surfaces:

| Surface | What gets published |
| --- | --- |
| GitHub Releases | Changelog, benchmark tarball, SFT JSONL, patches JSONL, manifest |
| Harbor Hub | All packages under `harbor/` tagged with the release tag |
| Hugging Face | Dataset repo `tinycomputer/bun-bench-trajectories` |

## Release flow

```text
Generate trajectories
  → Export datasets
  → Stage release assets
  → Upload staging
  → Tag release
  → Run workflow_dispatch
  → Publish GitHub Release
  → Publish Harbor
  → Publish Hugging Face
```

### 1. Generate trajectories

Run agents locally and collect scored artifacts under `runs/`:

```sh
bun run run:suite --agent claude-code --tasks 'tasks/**'
```

`runs/` and `results/` stay local and gitignored. They are never committed or
published.

### 2. Export datasets

Export training JSONL from successful runs into the local `datasets/` tree:

```sh
bun run export:sft --runs 'runs/**' --out datasets/sft/bun-bench.jsonl
bun run export:patches --runs 'runs/**' --out datasets/patches/bun-bench.jsonl
```

These export paths are also gitignored. Review the export summary and confirm
split hygiene (see `docs/DATASETS.md`).

### 3. Stage release assets

Copy the exports into the release staging directory:

```sh
bun run release:stage
```

This writes:

```text
release-assets/
  bun-bench-sft.jsonl
  bun-bench-patches.jsonl
```

`release-assets/` is gitignored and is not part of the repository checkout.

Verify locally:

```sh
bun run release:verify -- --tag v0.1.0 --datasets-only
```

### 4. Upload staging

Upload the staged assets to Hugging Face so GitHub-hosted runners can fetch
them during the release workflow:

```sh
export HF_TOKEN=...   # write token for tinycomputer/bun-bench-trajectories
bun run release:upload-staging -- --tag v0.1.0
```

Files are stored at:

```text
staging/<tag>/bun-bench-sft.jsonl
staging/<tag>/bun-bench-patches.jsonl
```

in `tinycomputer/bun-bench-trajectories`. Staging is separate from the final
published release paths under `releases/<tag>/`.

### 5. Tag the release

Create the tag on the source commit (no dataset JSONL in git):

```sh
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

Use [Semantic Versioning](https://semver.org/) tags prefixed with `v`
(for example `v0.1.0`, `v1.0.0`).

The workflow verifies that:

- the tag already exists on the remote
- the checked-out commit exactly matches the tag
- staged release assets can be fetched for that tag

It does **not** create or move tags.

### 6. Run the release workflow

Open **Actions → Release → Run workflow**.

#### Dry run first

| Input | Value |
| --- | --- |
| `tag` | Your tag, e.g. `v0.1.0` |
| `dry_run` | `true` |
| `publish_harbor` | `true` or `false` |
| `publish_huggingface` | `true` or `false` |

Dry runs execute the full validation and build pipeline on GitHub-hosted runners:

1. Checkout the tag (source only)
2. Fetch staged assets from Hugging Face into `release-assets/`
3. `bun run validate`
4. `bun test`
5. Verify release assets and safety rules
6. Build artifacts into `dist/release/`
7. Verify the tarball excludes `runs/`, `results/`, and `release-assets/`
8. Run `release-it --dry-run` to preview the GitHub Release and changelog
9. Print Harbor and Hugging Face publish commands without uploading

Fix any failures before running a real release.

#### Real release

Run the same workflow with `dry_run: false`.

When `dry_run` is false:

- **GitHub Release** is created (or updated) for the existing tag via `release-it`
- **Harbor Hub** packages are published when `publish_harbor=true`
- **Hugging Face** release dataset files are uploaded when `publish_huggingface=true`

## Prerequisites

### GitHub secrets and variables

| Name | Type | Purpose |
| --- | --- | --- |
| `TINYCOMPUTER_GITHUB_APP_CLIENT_ID` | Organization variable | Client ID for the TinyComputer GitHub App |
| `TINYCOMPUTER_GITHUB_APP_PRIVATE_KEY` | secret | Private key for the TinyComputer GitHub App |
| `HARBOR_TOKEN` | secret | Base64-encoded Harbor CLI credentials (`~/.harbor/credentials.json`) |
| `HF_TOKEN` | secret | Hugging Face write token (staging upload + final dataset publish) |

GitHub Releases are created by the **TinyComputer GitHub App**, not the default
`GITHUB_TOKEN`. The release workflow mints an app installation token with
`contents: write` and passes it to `release-it` as `GITHUB_TOKEN`. Releases
appear under the app bot identity (for example `tinycomputer[bot]`).

The app must be installed on the `tinycomputerai` organization with access to
this repository and permission to create releases.

### Harbor credentials

Run `uvx harbor auth login` locally once, then base64-encode the credentials
file into the `HARBOR_TOKEN` secret:

```sh
base64 < ~/.harbor/credentials.json | tr -d '\n'
```

### Hugging Face token

Create a token with write access to `tinycomputer/bun-bench-trajectories` and
store it as `HF_TOKEN`. Used both for staging upload before the tag and for
final dataset publication during the workflow.

## What gets published

### GitHub Releases

Files uploaded from `dist/release/`:

| Artifact | Description |
| --- | --- |
| `bun-bench-<tag>.tar.gz` | Benchmark source bundle (`harbor/`, `tasks/`, schemas, runners, docs) |
| `bun-bench-sft-<tag>.jsonl` | Supervised fine-tuning chat records |
| `bun-bench-patches-<tag>.jsonl` | Patch-oriented training records |
| `bun-bench-manifest-<tag>.json` | Release metadata and record counts |

The tarball excludes `runs/`, `results/`, `jobs/`, `datasets/`, `release-assets/`,
`node_modules/`, and `dist/`.

### Harbor Hub

All task packages under `harbor/` are published with:

```sh
uvx harbor publish harbor/ -t <tag> --public
```

### Hugging Face

Dataset repo: [tinycomputer/bun-bench-trajectories](https://huggingface.co/datasets/tinycomputer/bun-bench-trajectories)

| Path | Content |
| --- | --- |
| `staging/<tag>/…` | Pre-release staging (uploaded before workflow) |
| `releases/<tag>/…` | Versioned release exports (uploaded by workflow) |
| `data/sft/bun-bench.jsonl` | Latest SFT pointer |
| `data/patches/bun-bench.jsonl` | Latest patches pointer |

## Local commands

```sh
# Stage exports into release-assets/
bun run release:stage

# Upload staging to Hugging Face (before tagging)
bun run release:upload-staging -- --tag v0.1.0

# Verify staged assets (pre-build)
bun run release:verify -- --tag v0.1.0 --datasets-only

# Fetch staging locally (same step CI runs)
bun run release:fetch-staging -- --tag v0.1.0

# Build dist/release artifacts
bun run release:build -- --tag v0.1.0

# Verify assets + tarball (post-build)
bun run release:verify -- --tag v0.1.0

# GitHub / Harbor / Hugging Face publish scripts
bun run release:github:dry-run -- 0.1.0
bun run release:harbor -- --tag v0.1.0 --dry-run
bun run release:huggingface -- --tag v0.1.0 --dry-run
```

## Rollback and retry

### Staging upload failed or wrong assets staged

1. Fix exports and re-run `release:stage`.
2. Re-run `release:upload-staging -- --tag <tag>` (overwrites staging paths).
3. Proceed with tag and workflow.

### GitHub Release failed after artifacts were built

1. Fix the issue and re-run the workflow with the same tag and `dry_run=false`.
2. `release-it` updates the existing GitHub Release without creating a new tag.

### Harbor or Hugging Face publish failed

Re-run the workflow with `dry_run=false`, disabling steps that already succeeded.

### Bad release published

1. Delete the GitHub Release (tag remains).
2. Revert Harbor/Hugging Face publication as needed.
3. Re-stage, re-upload staging, and release under a new tag (e.g. `v0.1.1`).

## Safety checks

Staged release assets must pass before artifacts are built:

- `release-assets/bun-bench-sft.jsonl` and `release-assets/bun-bench-patches.jsonl`
  exist and are non-empty
- No `public_eval` or `private_eval` examples
- No hidden test paths in patch content
- No reference solution paths in patch content

Release artifacts must pass before publishing:

- Tarball does not contain `runs/`, `results/`, or `release-assets/`

See `docs/DATASETS.md` for export rules and split policy.
