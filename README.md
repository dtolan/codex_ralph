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

Safety default: codex-loop will run Codex in `--full-auto` mode scoped to the repo root via `--cd <repo-root>`. `--yolo` is blocked unless the user explicitly passes `--force-yolo`, and the CLI will display a loud warning about the risks.
The CLI will still ask for confirmation before starting a loop, even if defaults are provided by flags.

## Quick Start

```bash
# run via npx (once published)
npx codex-loop --dry-run

# run locally from this repo
npm install
node src/cli.js --dry-run

# build/update prompt only
node src/cli.js --prompt-only

# run the loop using existing prompt
node src/cli.js --run-loop
```

## Defaults Mode

`--defaults` runs non-interactive with auto-confirmations and the current config defaults. It will exit if no git repo is detected. Defaults used unless overridden by config or CLI flags:

- `--max-loops`: 20
- Codex: `--model gpt-5`, `--sandbox workspace-write`, `--full-auto`, `--cd <repo-root>`
- Safety: `--yolo` disabled (blocked unless `--force-yolo`)
- Git: per-iteration commits with message `codex-loop: iter {n} - {summary}`
- Logging: `.codex_logs/` local-only (unless `--log-commit`)

## How It Works (Planned)

1. Repo detection
   - If `.git` exists, show current repo + branch and ask for confirmation.
   - If no repo, prompt for local path or a remote URL to clone.
   - If there is no remote configured, ask for explicit confirmation before proceeding.
   - If the working tree is dirty, warn and ask whether to proceed.
2. Branch creation
   - Default: create a new branch from the current branch.
   - Branch name: `(<prefix>/)?codex-YYYYMMDD-HHMMSS`.
   - Warn if the current branch is not the default branch.
3. Prompt builder
   - Detects project type (Node, Python, Go, Rust, etc.).
   - Prompts for goal, constraints, acceptance criteria, and test commands.
   - Asks for a max-iteration limit, even if `--max-loops` is provided (for confirmation).
4. Prompt file
   - Writes `.codex/CODEX_PROMPT.md` with a structured template.
5. Codex loop
   - Runs `codex exec` in a fresh iteration each time.
   - Defaults to `--full-auto` and `--cd <repo-root>` to keep changes inside the repo.
   - `--yolo` is blocked unless `--force-yolo` is provided, with a loud warning.
   - Use `--defaults` for non-interactive runs (auto-confirms prompts and uses config defaults).
   - Use `--dry-run` to generate the prompt and show the codex command without executing or committing.
   - Use `--print-config` to output the effective config plus derived repo/branch and codex command.
   - Use `--prompt-only` to update the prompt and exit.
   - Use `--run-loop` to run with the existing prompt.
   - Use `--update-prompt` to rebuild the prompt before running.
   - Stops when completion signal is detected, tests pass, no tracked diffs, or max loops reached.
6. Git check-in
   - After each iteration, run `git status --porcelain` to detect changes.
   - If there are tracked changes, stage and commit to preserve an audit trail.
   - Commit message format: `codex-loop: iter <n> - <short summary>`.
7. Logging
   - Logs per-iteration output and diffs to `.codex_logs/<run-id>/`.
   - Logs are local-only by default; `codex-loop` will ensure `.gitignore` includes `.codex_logs/`.
   - Use `--log-commit` to include `.codex_logs/` in commits for audit trails.

## Planned CLI Usage

```bash
# default run (interactive)
codex-loop

# preview what would run (skips codex execution and git commits)
codex-loop --dry-run

# build/update the prompt only
codex-loop --prompt-only

# run using the existing prompt (no prompt builder)
codex-loop --run-loop

# rebuild the prompt before running (use with --run-loop or default)
codex-loop --update-prompt

# non-interactive defaults (auto-confirms, uses config + defaults)
codex-loop --defaults

# print effective config plus derived repo/branch and codex command
codex-loop --print-config

# with explicit loop limit and codex flags
codex-loop --max-loops 50 --model gpt-5 --sandbox --search

# allow yolo (dangerous; disabled by default)
codex-loop --max-loops 50 --model gpt-5 --yolo --force-yolo

# override codex binary
codex-loop --codex-path "C:\\tools\\codex.exe"

# include logs in commits (audit trail)
codex-loop --log-commit
```

## Prompt File Format (Planned)

Location: `.codex/CODEX_PROMPT.md`

Key properties:
- Immutable during a run (the loop reuses the same prompt each iteration).
- Includes a machine-readable completion block and an escape hatch.
The default template lives at `.codex/CODEX_PROMPT.template.md`.

Example footer:

```text
PROMISE: true
EXIT_MESSAGE: "All parameters and tests have completed successfully"
```

## Config and State (Planned)

- `.codex/config.json`
  - Default settings (model, sandbox, search, max loops, test command)
- `.codex/config.schema.json`
  - JSON schema for validating config files
- `.codex/state.json`
  - Last run state (repo, branch, prompt metadata, last run id)
- `.codex_logs/<run-id>/`
  - Iteration logs, prompt snapshot, git diffs

Note: `.codex/state.json` and `.codex_logs/` are local-only and should not be committed by default.
`--log-commit` temporarily allows `.codex_logs/` to be committed for the current run.
`codex-loop` will ensure `.gitignore` includes `.codex/state.json` and `.codex_logs/` when the tool runs.
Settings precedence: CLI flags override `.codex/config.json`, and interactive confirmations still occur before a run starts.

## Stop Conditions (Planned)

The loop stops when any of these are met:
- `PROMISE: true` is detected in Codex output.
- Tests pass (per configured command).
- No tracked file changes are present.
- Max loops reached.

Untracked files do not block completion.

Safety note: `--full-auto` still runs commands without prompts. Keep test/build commands scoped to known scripts and avoid destructive operations.

## Status

This repository currently contains design notes only. Implementation will start after design review.
