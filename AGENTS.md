# Repository Guidelines

## Project Structure & Module Organization

- `src/` — main CLI logic (`src/cli.js`)
- `bin/` — executable shim (`bin/codex-loop.js`) for `npx`/`npm link`
- `.codex/` — prompt templates and config defaults
- `.github/workflows/` — CI workflow definitions
- `.codex_logs/` — run logs (local-only; gitignored)

Keep new modules small and focused; prefer shared helpers inside `src/`.

## Build, Test, and Development Commands

- `npm install` — install dependencies
- `npm test` — smoke test (`--defaults --dry-run`)
- `npm run lint` — syntax check for the CLI
- `node src/cli.js --dry-run` — interactive dry run
- `npm link` then `codex-loop --dry-run` — test the shim locally

## Coding Style & Naming Conventions

- Indentation: 2 spaces (JavaScript)
- Filenames: `kebab-case` for flags, `camelCase` for JS identifiers
- Keep CLI output concise and explicit; avoid silent failures

## Testing Guidelines

Current smoke test is non-interactive:
- `npm test` runs `node src/cli.js --defaults --dry-run`

Add new tests under `tests/` if needed and document how to run them.

## Commit & Pull Request Guidelines

- Use clear, imperative subjects (e.g., "Add defaults mode")
- Keep commits focused; avoid mixing unrelated changes
- PRs should include summary, testing steps, and behavior changes

## Configuration & Security Notes

- `.codex/state.json` and `.codex_logs/` are local-only and gitignored
- `--yolo` is blocked unless `--force-yolo` is provided
