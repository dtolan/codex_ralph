# CODEX Prompt

## Context
- Repo: {{repo}}
- Branch: {{branch}}
- Date: {{date}}
- Project type: {{projectType}}

## Goal
{{goal}}

## In Scope
{{inScope}}

## Out of Scope
{{outScope}}

## Constraints
- Do not modify files outside the repo.
- Do not change CI/CD or infra unless explicitly requested.
- Avoid adding new dependencies unless necessary and justified.
- Keep changes minimal and focused.
{{constraints}}

## Acceptance Criteria
{{acceptanceCriteria}}
- Tests pass: {{testCommand}}
- Build succeeds: {{buildCommand}}
- Lint clean: {{lintCommand}}

## Required Commands
- Test: {{testCommand}}
- Build: {{buildCommand}}
- Lint: {{lintCommand}}

## Execution Rules
- Use the existing project conventions.
- Prefer small, verifiable changes.
- If you get stuck, document blockers and suggest next steps.

## Escape Hatch
If not complete by iteration {{maxLoops}}:
- Summarize what’s done
- List blockers
- Propose the next action

## Completion Signal (Exact Match)
PROMISE: true
EXIT_MESSAGE: "All parameters and tests have completed successfully"
