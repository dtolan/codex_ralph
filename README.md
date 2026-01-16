# codex-loop

codex-loop is a CLI wrapper that builds a structured Codex prompt, creates a safety-checked Git branch, and runs Codex in an iterative loop until completion or a max-iteration limit is reached. It is inspired by the Ralph Wiggum loop pattern, but implemented as a portable Node.js CLI.

## Goals

- Help users build a high-quality `CODEX_PROMPT.md` with clear requirements and exit criteria.
- Provide a repeatable, logged loop that runs Codex until success conditions are met.
- Keep the workflow safe, observable, and reversible via Git.

## Requirements

- Node.js >= 18
- Git installed and on PATH
- Codex CLI installed and on PATH: `npm i -g @openai/codex`

Note: `--yolo` is supported for fully automatic runs. Use only in isolated environments.

## How It Works (Planned)

1. Repo detection
   - If `.git` exists, show current repo + branch and ask for confirmation.
   - If no repo, prompt for local path or a remote URL to clone.
2. Branch creation
   - Default: create a new branch from the current branch.
   - Branch name: `(<prefix>/)?codex-YYYYMMDD-HHMMSS`.
3. Prompt builder
   - Detects project type (Node, Python, Go, Rust, etc.).
   - Prompts for goal, constraints, acceptance criteria, and test commands.
4. Prompt file
   - Writes `.codex/CODEX_PROMPT.md` with a structured template.
5. Codex loop
   - Runs `codex exec` in a fresh iteration each time.
   - Stops when completion signal is detected, tests pass, no tracked diffs, or max loops reached.
6. Logging
   - Logs per-iteration output and diffs to `.codex_logs/<run-id>/`.

## Planned CLI Usage

```bash
# default run (interactive)
codex-loop

# with explicit loop limit and codex flags
codex-loop --max-loops 50 --model gpt-5 --sandbox --search --yolo

# override codex binary
codex-loop --codex-path "C:\\tools\\codex.exe"
```

## Prompt File Format (Planned)

Location: `.codex/CODEX_PROMPT.md`

Key properties:
- Immutable during a run (the loop reuses the same prompt each iteration).
- Includes a machine-readable completion block and an escape hatch.

Example footer:

```text
PROMISE: true
EXIT_MESSAGE: "All parameters and tests have completed successfully"
```

## Config and State (Planned)

- `.codex/config.json`
  - Default settings (model, sandbox, search, max loops, test command)
- `.codex/state.json`
  - Last run state (repo, branch, prompt metadata, last run id)
- `.codex_logs/<run-id>/`
  - Iteration logs, prompt snapshot, git diffs

## Stop Conditions (Planned)

The loop stops when any of these are met:
- The completion promise is detected in Codex output.
- Tests pass (per configured command).
- No tracked file changes are present.
- Max loops reached.

Untracked files do not block completion.

## Status

This repository currently contains design notes only. Implementation will start after design review.
