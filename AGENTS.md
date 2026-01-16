# Repository Guidelines

## Project Structure & Module Organization

This repository is currently a blank Git repo (no tracked source files yet). As code is added, keep a simple, predictable layout and update this guide. Recommended default structure:

- `src/` for application/library code
- `tests/` for automated tests
- `scripts/` for developer utilities
- `docs/` for design notes and long-form documentation
- `assets/` for static files (images, fixtures)

If you introduce a different layout, document it here and keep module boundaries clear (for example, `src/api/`, `src/ui/`, `src/db/`).

## Build, Test, and Development Commands

No build or test tooling is configured yet. When you add tooling, document the exact commands and what they do. Example format:

- `npm run dev` — start local development server
- `npm test` — run the test suite
- `npm run lint` — run style and static checks

Keep this list short and accurate; remove examples that do not apply.

## Coding Style & Naming Conventions

There is no enforced style yet. Until a formatter/linter is added, follow the conventions of the language you introduce and keep changes internally consistent. If you add a formatter (for example, Prettier/ESLint, Black, gofmt), commit its config and document:

- indentation (tabs vs spaces and width)
- naming patterns (folders, files, types)
- any required pre-commit hooks or CI checks

## Testing Guidelines

No test framework is set up yet. When tests are introduced, place them under `tests/` (or alongside code if the ecosystem expects it) and document the naming pattern (for example, `*.spec.ts` or `*_test.go`). New features and bug fixes should include tests or a short note explaining why not.

## Commit & Pull Request Guidelines

This repository has no commit history, so there is no established convention. Use clear, imperative commit subjects (for example, "Add parser for config files") and consider Conventional Commits if the team agrees. For pull requests:

- include a concise description and how to test
- link related issues or tickets
- add screenshots or recordings for UI changes
- call out any follow-up work or migration steps

## Configuration & Security Notes

If you add secrets, keep them out of the repo and document required environment variables in `docs/` or a future `README.md`.
